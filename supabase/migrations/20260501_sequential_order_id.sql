-- Sequential order IDs: SHD-00001, SHD-00002, ...
CREATE SEQUENCE IF NOT EXISTS order_seq START 1;

ALTER TABLE public.orders
  ALTER COLUMN id SET DEFAULT 'SHD-' || LPAD(nextval('order_seq')::text, 5, '0');
