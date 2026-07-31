-- Add reschedule delivery columns to orders table
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS scheduled_delivery_date DATE,
  ADD COLUMN IF NOT EXISTS delivery_status TEXT,
  ADD COLUMN IF NOT EXISTS delivery_rescheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_rescheduled_by TEXT;
