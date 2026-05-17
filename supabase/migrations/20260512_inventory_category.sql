ALTER TABLE inventory_items
ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'consumable'
CHECK (category IN ('consumable', 'production'));
