-- Remove high-churn, large-payload configuration table from Realtime publication
-- Fixes runaway Realtime Messages overage (23.3M msgs / 424 GB egress)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'app_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.app_settings;
  END IF;
END $$;

