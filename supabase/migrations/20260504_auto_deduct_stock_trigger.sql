-- Migration to automate stock deduction on order item insertion

CREATE OR REPLACE FUNCTION handle_new_order_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_product_id int;
BEGIN
  v_product_id := NEW.product_id;

  -- If product_id is not provided (e.g. from external webhook or storefront lacking IDs),
  -- try to match the product by its exact name.
  IF v_product_id IS NULL AND NEW.name IS NOT NULL THEN
    SELECT id INTO v_product_id
    FROM products
    WHERE name ILIKE NEW.name
    LIMIT 1;

    -- If found, assign it to the new order item so it links properly in the DB
    IF v_product_id IS NOT NULL THEN
      NEW.product_id := v_product_id;
    END IF;
  END IF;

  -- Deduct stock if we found a valid product
  IF v_product_id IS NOT NULL THEN
    UPDATE products
    SET stock = GREATEST(0, stock - COALESCE(NEW.qty, 1))
    WHERE id = v_product_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop the trigger if it already exists (to allow re-running this migration safely)
DROP TRIGGER IF EXISTS on_new_order_item ON order_items;

-- Attach the trigger
CREATE TRIGGER on_new_order_item
  BEFORE INSERT ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_order_item();
