-- Backfill: storefront orders (smokeyhutdelight.shop) had payment_method='cash' by mistake.
-- Storefront orders have no channel set; WhatsApp bot orders have channel='whatsapp'.
UPDATE orders
SET payment_method = 'whatsapp'
WHERE payment_method = 'cash'
  AND (channel IS NULL OR channel = '');
