-- 1) Add batch metadata columns to transactions (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'token_count'
  ) THEN
    ALTER TABLE public.transactions
      ADD COLUMN token_count integer NOT NULL DEFAULT 1,
      ADD COLUMN mode text CHECK (mode IN ('usd','credits')),
      ADD COLUMN fee_usd numeric,
      ADD COLUMN credits_per_token integer NOT NULL DEFAULT 0,
      ADD COLUMN total_credits integer NOT NULL DEFAULT 0;
  END IF;
END$$;

-- 2) Create tokens table to store generated tokens
CREATE TABLE IF NOT EXISTS public.tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_tx_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  product_id uuid,
  token_string text NOT NULL UNIQUE,
  credits integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tokens ENABLE ROW LEVEL SECURITY;

-- 3) RLS policies for tokens
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tokens' AND policyname='Users can insert their own tokens'
  ) THEN
    CREATE POLICY "Users can insert their own tokens" ON public.tokens
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tokens' AND policyname='Users can view their own tokens'
  ) THEN
    CREATE POLICY "Users can view their own tokens" ON public.tokens
    FOR SELECT
    USING (auth.uid() = user_id);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tokens' AND policyname='Admins can view all tokens'
  ) THEN
    CREATE POLICY "Admins can view all tokens" ON public.tokens
    FOR SELECT
    USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tokens' AND policyname='Admins can insert tokens'
  ) THEN
    CREATE POLICY "Admins can insert tokens" ON public.tokens
    FOR INSERT
    WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END$$;