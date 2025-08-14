-- Only rename invoice_id to order_id since pay_currency already exists
ALTER TABLE public.payment_history 
RENAME COLUMN invoice_id TO order_id;