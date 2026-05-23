-- Restore stock when an order is cancelled (going forward)
-- and back-fill the historical gap from already-cancelled orders.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Trigger function: fires on UPDATE to orders.status → 'cancelled'
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_order_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE products p
    SET stock = stock + oi.qty
    FROM order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.product_id IS NOT NULL
      AND oi.product_id = p.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_order_cancelled ON orders;
CREATE TRIGGER on_order_cancelled
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION handle_order_cancellation();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. One-time historical back-fill
--    Adds back the qty for every order_item that belongs to a cancelled order
--    and has a valid product_id.  Safe to run once; wrap in a transaction so
--    the correction is atomic.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  rows_affected int;
BEGIN
  WITH cancelled_qty AS (
    SELECT oi.product_id, SUM(oi.qty) AS total_qty
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.status = 'cancelled'
      AND oi.product_id IS NOT NULL
    GROUP BY oi.product_id
  )
  UPDATE products p
  SET stock = GREATEST(0, stock + cq.total_qty)
  FROM cancelled_qty cq
  WHERE p.id = cq.product_id;

  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RAISE NOTICE 'Stock back-fill: % product(s) corrected.', rows_affected;
END;
$$;
