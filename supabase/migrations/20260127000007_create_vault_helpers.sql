-- Migration: Create helper functions for Supabase Vault integration
-- Created: 2026-01-27
-- These functions provide secure access to store, update, and retrieve
-- encrypted secrets from Supabase Vault.
-- Note: vault extension is managed by Supabase and already enabled

-- Function to store a new secret in the vault
-- Returns the UUID of the created secret
CREATE OR REPLACE FUNCTION store_integration_secret(
  p_secret TEXT,
  p_name TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id UUID;
BEGIN
  -- Insert the secret into vault
  INSERT INTO vault.secrets (secret, name, description)
  VALUES (p_secret, p_name, p_description)
  RETURNING id INTO v_secret_id;

  RETURN v_secret_id;
END;
$$;

-- Function to update an existing secret in the vault
CREATE OR REPLACE FUNCTION update_integration_secret(
  p_secret_id UUID,
  p_new_secret TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
  UPDATE vault.secrets
  SET secret = p_new_secret,
      updated_at = NOW()
  WHERE id = p_secret_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Secret with id % not found', p_secret_id;
  END IF;
END;
$$;

-- Function to delete a secret from the vault
CREATE OR REPLACE FUNCTION delete_integration_secret(p_secret_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
  DELETE FROM vault.secrets WHERE id = p_secret_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Secret with id % not found', p_secret_id;
  END IF;
END;
$$;

-- Function to get decrypted secret (for Edge Functions via service role)
-- This should ONLY be called from Edge Functions with service_role key
CREATE OR REPLACE FUNCTION get_decrypted_secret(p_secret_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret TEXT;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE id = p_secret_id;

  RETURN v_secret;
END;
$$;

-- Revoke execute from public (no anonymous access)
REVOKE EXECUTE ON FUNCTION store_integration_secret FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION update_integration_secret FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION delete_integration_secret FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_decrypted_secret FROM PUBLIC;

-- Grant execute to authenticated users for store/update/delete
-- These users can manage their own secrets
GRANT EXECUTE ON FUNCTION store_integration_secret TO authenticated;
GRANT EXECUTE ON FUNCTION update_integration_secret TO authenticated;
GRANT EXECUTE ON FUNCTION delete_integration_secret TO authenticated;

-- get_decrypted_secret is only for service_role (Edge Functions)
-- Regular authenticated users should NEVER be able to decrypt secrets directly
GRANT EXECUTE ON FUNCTION get_decrypted_secret TO service_role;

-- Add comments for documentation
COMMENT ON FUNCTION store_integration_secret IS 'Stores an encrypted secret in Supabase Vault. Returns the secret UUID for reference.';
COMMENT ON FUNCTION update_integration_secret IS 'Updates an existing secret in the vault with a new value.';
COMMENT ON FUNCTION delete_integration_secret IS 'Permanently deletes a secret from the vault.';
COMMENT ON FUNCTION get_decrypted_secret IS 'Retrieves the decrypted secret value. Only accessible via service_role (Edge Functions).';
