-- Track a last-modified timestamp on orders so the partner order-export API can do
-- incremental sync: partners poll ?since=<updated_at> and receive both brand-new
-- orders AND orders whose status later changed (e.g. pending -> delivered ->
-- cancelled). Without this, a ?since cursor on created_at only ever surfaces new
-- orders and never status transitions.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Backfill existing rows to their creation time.
UPDATE public.orders SET updated_at = COALESCE(updated_at, created_at) WHERE updated_at IS NULL;

-- New rows default to now(); the trigger below keeps it current on every change.
ALTER TABLE public.orders ALTER COLUMN updated_at SET DEFAULT now();

CREATE OR REPLACE FUNCTION public.set_orders_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_orders_updated_at();
