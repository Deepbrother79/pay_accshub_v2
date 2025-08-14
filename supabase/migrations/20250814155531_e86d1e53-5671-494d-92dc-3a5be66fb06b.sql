-- Add pay_currency column and rename invoice_id to order_id in payment_history
ALTER TABLE public.payment_history 
ADD COLUMN pay_currency text;

-- Rename invoice_id to order_id 
ALTER TABLE public.payment_history 
RENAME COLUMN invoice_id TO order_id;