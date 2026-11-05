-- Migration: 20261105_order_lifecycle_columns_and_invariants.sql
-- Description: First-class order lifecycle, packaging, and rider assignment columns on public.orders table

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS rider_name text,
  ADD COLUMN IF NOT EXISTS rider_id integer,
  ADD COLUMN IF NOT EXISTS rider_type text DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS third_party_provider text,
  ADD COLUMN IF NOT EXISTS booked_fee numeric,
  ADD COLUMN IF NOT EXISTS fee_evidence_path text,
  ADD COLUMN IF NOT EXISTS fee_verify_status text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS packaging_status text DEFAULT 'ready_for_fulfillment',
  ADD COLUMN IF NOT EXISTS packaged_at timestamptz,
  ADD COLUMN IF NOT EXISTS packaged_by text,
  ADD COLUMN IF NOT EXISTS pickup_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- Ensure RLS allows anon & authenticated to select and update these lifecycle columns for operations
GRANT SELECT, UPDATE ON public.orders TO anon, authenticated;
