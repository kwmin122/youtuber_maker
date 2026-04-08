-- Enable RLS on jobs table
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- Custom function to extract user_id from JWT (works with better-auth JWTs)
CREATE OR REPLACE FUNCTION get_user_id()
RETURNS text AS $$
BEGIN
  RETURN current_setting('request.jwt.claims', true)::json->>'sub';
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- Users can only view their own jobs via Realtime
CREATE POLICY "Users can view own jobs"
  ON jobs FOR SELECT
  USING (user_id = get_user_id());

-- Enable Realtime for jobs table
ALTER PUBLICATION supabase_realtime ADD TABLE jobs;
