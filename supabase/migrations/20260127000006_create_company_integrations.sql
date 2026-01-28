-- Migration: Create company_integrations table for storing API credentials
-- Created: 2026-01-27
-- This table stores integration settings per company, with sensitive data (API tokens)
-- stored in Supabase Vault and referenced by UUID.

-- Create company_integrations table
CREATE TABLE company_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Fakturownia Integration
  fakturownia_enabled BOOLEAN NOT NULL DEFAULT false,
  fakturownia_subdomain TEXT,
  fakturownia_api_token_id UUID,  -- Reference to vault.secrets.id

  -- AI Integration (for future use)
  ai_enabled BOOLEAN NOT NULL DEFAULT false,
  ai_provider TEXT,  -- 'openrouter', 'openai', 'anthropic'
  ai_api_key_id UUID,  -- Reference to vault.secrets.id

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Each company can only have one integration settings record
  CONSTRAINT company_integrations_company_unique UNIQUE (company_id)
);

-- Create indexes for faster lookups
CREATE INDEX idx_company_integrations_user ON company_integrations(user_id);
CREATE INDEX idx_company_integrations_company ON company_integrations(company_id);

-- Enable Row Level Security
ALTER TABLE company_integrations ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own integrations
CREATE POLICY "company_integrations_select_own" ON company_integrations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "company_integrations_insert_own" ON company_integrations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "company_integrations_update_own" ON company_integrations
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "company_integrations_delete_own" ON company_integrations
  FOR DELETE USING (auth.uid() = user_id);

-- Trigger for automatically updating updated_at timestamp
CREATE TRIGGER company_integrations_updated_at
  BEFORE UPDATE ON company_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Add comment for documentation
COMMENT ON TABLE company_integrations IS 'Stores integration settings per company (Fakturownia, AI). API tokens are stored encrypted in Supabase Vault.';
COMMENT ON COLUMN company_integrations.fakturownia_api_token_id IS 'UUID reference to encrypted API token in vault.secrets table';
COMMENT ON COLUMN company_integrations.ai_api_key_id IS 'UUID reference to encrypted AI API key in vault.secrets table';
