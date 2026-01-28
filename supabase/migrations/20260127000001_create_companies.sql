-- ============================================
-- Migration: Create companies table
-- Purpose: Support for multiple company contexts per user
-- ============================================

-- Create companies table
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Each user can have only one company with a given name
  CONSTRAINT companies_user_name_unique UNIQUE (user_id, name)
);

-- Indexes
CREATE INDEX idx_companies_user ON companies(user_id);
CREATE INDEX idx_companies_user_default ON companies(user_id) WHERE is_default = true;

-- Enable RLS
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "companies_select_own" ON companies
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "companies_insert_own" ON companies
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "companies_update_own" ON companies
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "companies_delete_own" ON companies
  FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Constraint: Only one default company per user
-- ============================================
CREATE OR REPLACE FUNCTION check_single_default_company()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    -- Unset any existing default for this user
    UPDATE companies
    SET is_default = false
    WHERE user_id = NEW.user_id
      AND id != NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER ensure_single_default_company
  BEFORE INSERT OR UPDATE ON companies
  FOR EACH ROW
  EXECUTE FUNCTION check_single_default_company();
