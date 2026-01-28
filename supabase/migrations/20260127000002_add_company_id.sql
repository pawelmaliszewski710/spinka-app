-- ============================================
-- Migration: Add company_id to existing tables
-- Purpose: Link invoices, payments, matches to company context
-- ============================================

-- ============================================
-- Step 1: Add company_id columns (nullable initially)
-- ============================================

ALTER TABLE invoices ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE payments ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE matches ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- ============================================
-- Step 2: Create default company for existing users with data
-- ============================================

-- Create default company for users who have invoices
INSERT INTO companies (user_id, name, description, is_default)
SELECT DISTINCT user_id, 'Domyślna firma', 'Automatycznie utworzona firma domyślna', true
FROM invoices
WHERE user_id NOT IN (SELECT user_id FROM companies)
ON CONFLICT (user_id, name) DO NOTHING;

-- Create default company for users who only have payments (no invoices)
INSERT INTO companies (user_id, name, description, is_default)
SELECT DISTINCT user_id, 'Domyślna firma', 'Automatycznie utworzona firma domyślna', true
FROM payments
WHERE user_id NOT IN (SELECT user_id FROM companies)
ON CONFLICT (user_id, name) DO NOTHING;

-- ============================================
-- Step 3: Migrate existing data to default company
-- ============================================

-- Update invoices with default company
UPDATE invoices i
SET company_id = c.id
FROM companies c
WHERE i.user_id = c.user_id
  AND c.is_default = true
  AND i.company_id IS NULL;

-- Update payments with default company
UPDATE payments p
SET company_id = c.id
FROM companies c
WHERE p.user_id = c.user_id
  AND c.is_default = true
  AND p.company_id IS NULL;

-- Update matches with default company
UPDATE matches m
SET company_id = c.id
FROM companies c
WHERE m.user_id = c.user_id
  AND c.is_default = true
  AND m.company_id IS NULL;

-- ============================================
-- Step 4: Make company_id NOT NULL
-- ============================================

ALTER TABLE invoices ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE payments ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE matches ALTER COLUMN company_id SET NOT NULL;

-- ============================================
-- Step 5: Update unique constraints
-- ============================================

-- Drop old constraints
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_user_invoice_unique;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_user_ref_unique;

-- Add new constraints with company_id
ALTER TABLE invoices ADD CONSTRAINT invoices_company_invoice_unique UNIQUE (company_id, invoice_number);
-- Only add unique constraint for payments where reference is not null
CREATE UNIQUE INDEX payments_company_ref_unique ON payments(company_id, reference) WHERE reference IS NOT NULL;

-- ============================================
-- Step 6: Update indexes for company-based queries
-- ============================================

-- Drop old user_id based indexes
DROP INDEX IF EXISTS idx_invoices_user_status;
DROP INDEX IF EXISTS idx_invoices_user_due_date;
DROP INDEX IF EXISTS idx_invoices_user_created;
DROP INDEX IF EXISTS idx_invoices_unmatched;
DROP INDEX IF EXISTS idx_invoices_kind;
DROP INDEX IF EXISTS idx_payments_user_date;
DROP INDEX IF EXISTS idx_payments_user_amount;
DROP INDEX IF EXISTS idx_payments_user_created;
DROP INDEX IF EXISTS idx_matches_user;
DROP INDEX IF EXISTS idx_matches_user_date;

-- Create new company_id based indexes
CREATE INDEX idx_invoices_company_status ON invoices(company_id, payment_status);
CREATE INDEX idx_invoices_company_due_date ON invoices(company_id, due_date);
CREATE INDEX idx_invoices_company_created ON invoices(company_id, created_at DESC);
CREATE INDEX idx_invoices_company_unmatched ON invoices(company_id, gross_amount) WHERE payment_status IN ('pending', 'overdue', 'partial');
CREATE INDEX idx_invoices_company_kind ON invoices(company_id, invoice_kind);

CREATE INDEX idx_payments_company_date ON payments(company_id, transaction_date DESC);
CREATE INDEX idx_payments_company_amount ON payments(company_id, amount);
CREATE INDEX idx_payments_company_created ON payments(company_id, created_at DESC);

CREATE INDEX idx_matches_company ON matches(company_id);
CREATE INDEX idx_matches_company_date ON matches(company_id, matched_at DESC);

-- ============================================
-- Step 7: Update RLS policies to use company ownership
-- ============================================

-- Drop old invoices policies
DROP POLICY IF EXISTS "invoices_select_own" ON invoices;
DROP POLICY IF EXISTS "invoices_insert_own" ON invoices;
DROP POLICY IF EXISTS "invoices_update_own" ON invoices;
DROP POLICY IF EXISTS "invoices_delete_own" ON invoices;

-- New invoices policies (check via companies table)
CREATE POLICY "invoices_select_own" ON invoices
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = invoices.company_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "invoices_insert_own" ON invoices
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = company_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "invoices_update_own" ON invoices
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = invoices.company_id AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = company_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "invoices_delete_own" ON invoices
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = invoices.company_id AND c.user_id = auth.uid()
    )
  );

-- Drop old payments policies
DROP POLICY IF EXISTS "payments_select_own" ON payments;
DROP POLICY IF EXISTS "payments_insert_own" ON payments;
DROP POLICY IF EXISTS "payments_update_own" ON payments;
DROP POLICY IF EXISTS "payments_delete_own" ON payments;

-- New payments policies
CREATE POLICY "payments_select_own" ON payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = payments.company_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "payments_insert_own" ON payments
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = company_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "payments_update_own" ON payments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = payments.company_id AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = company_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "payments_delete_own" ON payments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = payments.company_id AND c.user_id = auth.uid()
    )
  );

-- Drop old matches policies
DROP POLICY IF EXISTS "matches_select_own" ON matches;
DROP POLICY IF EXISTS "matches_insert_own" ON matches;
DROP POLICY IF EXISTS "matches_update_own" ON matches;
DROP POLICY IF EXISTS "matches_delete_own" ON matches;

-- New matches policies
CREATE POLICY "matches_select_own" ON matches
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = matches.company_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "matches_insert_own" ON matches
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = company_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "matches_update_own" ON matches
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = matches.company_id AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = company_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "matches_delete_own" ON matches
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = matches.company_id AND c.user_id = auth.uid()
    )
  );

-- ============================================
-- Step 8: Update views to include company_id
-- ============================================

-- Drop and recreate views with company_id
DROP VIEW IF EXISTS v_dashboard_summary;
DROP VIEW IF EXISTS v_overdue_invoices;
DROP VIEW IF EXISTS v_unmatched_payments;
DROP VIEW IF EXISTS v_unmatched_invoices;
DROP VIEW IF EXISTS v_matches_with_details;

-- Recreate dashboard summary view
CREATE VIEW v_dashboard_summary AS
SELECT
  company_id,
  payment_status,
  COUNT(*) as invoice_count,
  COALESCE(SUM(gross_amount), 0) as total_amount
FROM invoices
GROUP BY company_id, payment_status;

-- Recreate overdue invoices view
CREATE VIEW v_overdue_invoices AS
SELECT
  i.*,
  (CURRENT_DATE - i.due_date) as days_overdue
FROM invoices i
WHERE i.payment_status IN ('pending', 'overdue')
  AND i.due_date < CURRENT_DATE;

-- Recreate unmatched payments view
CREATE VIEW v_unmatched_payments AS
SELECT p.*
FROM payments p
WHERE NOT EXISTS (
  SELECT 1 FROM matches m WHERE m.payment_id = p.id
);

-- Recreate unmatched invoices view
CREATE VIEW v_unmatched_invoices AS
SELECT i.*
FROM invoices i
WHERE i.payment_status IN ('pending', 'overdue', 'partial')
  AND NOT EXISTS (
    SELECT 1 FROM matches m WHERE m.invoice_id = i.id
  );

-- Recreate matches with details view
CREATE VIEW v_matches_with_details AS
SELECT
  m.id as match_id,
  m.company_id,
  m.confidence_score,
  m.match_type,
  m.matched_at,
  m.matched_by,
  i.id as invoice_id,
  i.invoice_number,
  i.issue_date,
  i.due_date,
  i.gross_amount as invoice_amount,
  i.buyer_name,
  i.buyer_nip,
  i.payment_status,
  p.id as payment_id,
  p.transaction_date,
  p.amount as payment_amount,
  p.sender_name,
  p.title as payment_title,
  p.source as payment_source
FROM matches m
JOIN invoices i ON m.invoice_id = i.id
JOIN payments p ON m.payment_id = p.id;
