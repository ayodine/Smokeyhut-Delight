-- Optional per-product same-day order cutoff. When set, ordering this product
-- after this time (Africa/Lagos) means it can only be delivered/picked up the
-- next day. NULL = no special rule (product follows the normal store promise).
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS same_day_cutoff time;

-- The first product with this rule: "Travel standard Dry Guineafowl" (id 5),
-- cutoff 12:00 PM.
UPDATE public.products SET same_day_cutoff = '12:00:00' WHERE id = 5;
