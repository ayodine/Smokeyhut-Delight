-- Add channel column to orders to distinguish storefront vs whatsapp orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'storefront'
  CHECK (channel IN ('storefront', 'whatsapp'));
