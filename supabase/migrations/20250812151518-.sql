-- 1) Create enum app_role safely
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
  END IF;
END$$;

-- 2) Create user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3) has_role function (security definer)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- 4) RLS for user_roles: allow user to see own roles; admins can see all
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_roles' AND policyname = 'Users can view their own roles or admins all'
  ) THEN
    CREATE POLICY "Users can view their own roles or admins all" ON public.user_roles
    FOR SELECT
    USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
  END IF;
END$$;

-- Only admins can modify roles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_roles' AND policyname = 'Admins can modify roles'
  ) THEN
    CREATE POLICY "Admins can modify roles" ON public.user_roles
    FOR ALL
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END$$;

-- 5) profiles table to search by email safely from client
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS: users can see their own profile; admins can see all
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can view own profile or admins all'
  ) THEN
    CREATE POLICY "Users can view own profile or admins all" ON public.profiles
    FOR SELECT
    USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
  END IF;
END$$;

-- Prevent non-admin writes from client (only system/trigger updates)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Admins can modify profiles'
  ) THEN
    CREATE POLICY "Admins can modify profiles" ON public.profiles
    FOR ALL
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END$$;

-- 6) Trigger to populate profiles from auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = now();
  RETURN NEW;
END;
$$;

-- Create trigger if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
  END IF;
END$$;

-- 7) Extend RLS to allow admins to see payment_history & transactions and insert adjustments
-- payment_history: admins can view all
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'payment_history' AND policyname = 'Admins can view all payments'
  ) THEN
    CREATE POLICY "Admins can view all payments" ON public.payment_history
    FOR SELECT
    USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END$$;

-- transactions: admins can view all
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'transactions' AND policyname = 'Admins can view all transactions'
  ) THEN
    CREATE POLICY "Admins can view all transactions" ON public.transactions
    FOR SELECT
    USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END$$;

-- transactions: admins can insert (for balance adjustments)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'transactions' AND policyname = 'Admins can insert transactions'
  ) THEN
    CREATE POLICY "Admins can insert transactions" ON public.transactions
    FOR INSERT
    WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END$$;

-- 8) Seed the requested admin user (id must exist in auth.users)
INSERT INTO public.user_roles (user_id, role)
VALUES ('b7c943a2-06b5-42dc-93ca-c07d048f1c01', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
