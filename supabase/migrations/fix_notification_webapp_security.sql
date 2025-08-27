-- SAFE Security Fix for Notification_Webapp Table
-- This migration addresses critical RLS vulnerability without touching existing functions

-- Enable Row Level Security on Notification_Webapp table
ALTER TABLE public."Notification_Webapp" ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (safety measure)
DROP POLICY IF EXISTS "Admins can manage notifications" ON public."Notification_Webapp";
DROP POLICY IF EXISTS "Users can read visible notifications" ON public."Notification_Webapp";
DROP POLICY IF EXISTS "Only admins can insert notifications" ON public."Notification_Webapp";
DROP POLICY IF EXISTS "Only admins can update notifications" ON public."Notification_Webapp";
DROP POLICY IF EXISTS "Only admins can delete notifications" ON public."Notification_Webapp";

-- Simple policy for authenticated users to read only visible notifications
-- This is the safest approach without touching existing functions
CREATE POLICY "Users can read visible notifications" ON public."Notification_Webapp"
FOR SELECT USING (
  visible = true 
  AND auth.uid() IS NOT NULL
);

-- RESTRICTIVE: Only service_role can modify notifications 
-- This means only backend functions can insert/update/delete
CREATE POLICY "Only backend can modify notifications" ON public."Notification_Webapp"
FOR ALL USING (
  auth.jwt() ->> 'role' = 'service_role'
) WITH CHECK (
  auth.jwt() ->> 'role' = 'service_role'
);

-- Grant necessary permissions
GRANT SELECT ON public."Notification_Webapp" TO authenticated;
GRANT ALL ON public."Notification_Webapp" TO service_role;

-- Add comment for documentation
COMMENT ON TABLE public."Notification_Webapp" IS 'News and notifications table with RLS enabled. Users can only read visible notifications. Only service_role can modify.';

-- Note: If you need admin panel access later, you can add a separate policy:
-- CREATE POLICY "Admins can manage via existing has_role function" ON public."Notification_Webapp"
-- FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Verify the setup works
SELECT 
  tablename,
  policyname,
  cmd as operation,
  permissive
FROM pg_policies 
WHERE tablename = 'Notification_Webapp'
ORDER BY policyname;