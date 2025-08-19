-- Enable realtime for payment_history table
ALTER TABLE public.payment_history REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_history;