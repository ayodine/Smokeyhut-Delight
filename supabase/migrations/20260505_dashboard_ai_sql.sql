CREATE OR REPLACE FUNCTION exec_read_only_sql(q text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  res json;
BEGIN
  -- Basic safety checks
  IF q !~* '^\s*(WITH|SELECT)\s+' THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;
  
  IF q ~* '\y(INSERT|UPDATE|DELETE|TRUNCATE|DROP|CREATE|ALTER|GRANT|REVOKE|COPY|DO|EXECUTE|COMMIT|ROLLBACK|REPLACE)\y' THEN
    RAISE EXCEPTION 'Query contains forbidden keywords';
  END IF;

  -- Execute query and wrap in JSON
  EXECUTE 'SELECT COALESCE(json_agg(row_to_json(t)), ''[]'') FROM (' || q || ') t' INTO res;
  RETURN res;
END;
$$;
