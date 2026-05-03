-- Ledger-based consumables inventory
-- Stock is never stored directly — it is always derived from movements

CREATE TABLE IF NOT EXISTS inventory_movements (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id      uuid        NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  type         text        NOT NULL CHECK (type IN ('IN', 'OUT', 'ADJUSTMENT')),
  quantity     numeric     NOT NULL,                -- signed: ADJUSTMENT may be negative
  reference    text,                               -- supplier receipt, batch number, etc.
  note         text,
  created_by   uuid        REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_mov_item_id    ON inventory_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_created_at ON inventory_movements(created_at);

-- RLS: authenticated users can read and insert; no deletes allowed (audit trail)
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read movements"
  ON inventory_movements FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "auth insert movements"
  ON inventory_movements FOR INSERT
  TO authenticated WITH CHECK (true);
