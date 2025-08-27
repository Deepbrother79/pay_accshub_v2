-- Security Fix for Notification_Webapp Table
-- This migration addresses critical RLS vulnerability found in security audit

-- Enable Row Level Security on Notification_Webapp table
ALTER TABLE public."Notification_Webapp" ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (safety measure)
DROP POLICY IF EXISTS "Admins can manage notifications" ON public."Notification_Webapp";
DROP POLICY IF EXISTS "Users can read visible notifications" ON public."Notification_Webapp";
DROP POLICY IF EXISTS "Only admins can insert notifications" ON public."Notification_Webapp";
DROP POLICY IF EXISTS "Only admins can update notifications" ON public."Notification_Webapp";
DROP POLICY IF EXISTS "Only admins can delete notifications" ON public."Notification_Webapp";

-- Create a helper function to check admin role (if not exists)
CREATE OR REPLACE FUNCTION public.has_role(user_id uuid, role_name app_role)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.user_roles 
    WHERE user_roles.user_id = $1 
    AND user_roles.role = $2
  );
$$;

-- Policy for admins to manage all notifications (all operations)
CREATE POLICY "Admins can manage notifications" ON public."Notification_Webapp"
FOR ALL USING (
  public.has_role(auth.uid(), 'admin'::app_role)
);

-- Policy for authenticated users to read only visible notifications
CREATE POLICY "Users can read visible notifications" ON public."Notification_Webapp"
FOR SELECT USING (
  visible = true 
  AND auth.uid() IS NOT NULL
);

-- Additional security: Ensure only admins can modify notifications
CREATE POLICY "Only admins can insert notifications" ON public."Notification_Webapp"
FOR INSERT WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Only admins can update notifications" ON public."Notification_Webapp"
FOR UPDATE USING (
  public.has_role(auth.uid(), 'admin'::app_role)
) WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Only admins can delete notifications" ON public."Notification_Webapp"
FOR DELETE USING (
  public.has_role(auth.uid(), 'admin'::app_role)
);

-- Grant necessary permissions
GRANT SELECT ON public."Notification_Webapp" TO authenticated;
GRANT ALL ON public."Notification_Webapp" TO service_role;

-- Add comment for documentation
COMMENT ON TABLE public."Notification_Webapp" IS 'News and notifications table with RLS enabled. Admins can manage all notifications, users can only read visible ones.';

-- Verify the setup
SELECT 
  schemaname, 
  tablename, 
  rowsecurity as rls_enabled,
  policyname,
  permissive,
  cmd as operation,
  qual as condition
FROM pg_tables 
LEFT JOIN pg_policies ON (pg_tables.tablename = pg_policies.tablename)
WHERE pg_tables.tablename = 'Notification_Webapp' 
  AND pg_tables.schemaname = 'public'
ORDER BY policyname;