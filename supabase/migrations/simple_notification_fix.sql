-- ULTRA SAFE: Minimal RLS fix for Notification_Webapp
-- This version is the safest possible without touching any existing code

-- Enable Row Level Security
ALTER TABLE public."Notification_Webapp" ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read visible notifications
CREATE POLICY "read_visible_notifications" ON public."Notification_Webapp"
FOR SELECT USING (visible = true AND auth.uid() IS NOT NULL);

-- Block all modifications from users (INSERT/UPDATE/DELETE)
-- Only allow service_role (backend functions) to modify
CREATE POLICY "service_role_only_modify" ON public."Notification_Webapp"
FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Grant SELECT to authenticated users
GRANT SELECT ON public."Notification_Webapp" TO authenticated;

-- Verification query (should show 2 policies)
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'Notification_Webapp';