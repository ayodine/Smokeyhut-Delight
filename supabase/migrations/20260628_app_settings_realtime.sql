-- Enable Supabase Realtime for app_settings so storefront/dashboard clients get
-- live setting changes (e.g. the ticker banner) pushed to them without a reload
-- or waiting out the 5-minute client cache. Previously only `orders` was in the
-- realtime publication, so ticker edits never propagated to already-open pages.
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings;

-- REPLICA IDENTITY FULL guarantees the full row (incl. the jsonb `value`) is
-- delivered on every change event, not just the primary key.
ALTER TABLE public.app_settings REPLICA IDENTITY FULL;
