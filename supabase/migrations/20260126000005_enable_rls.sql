-- Migration: Enable Row Level Security on all tables
-- Created: 2026-01-26
-- CRITICAL: This ensures data isolation between users

-- Enable RLS on all tables
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

-- Invoices: Users can only access their own invoices
CREATE POLICY "invoices_select_own" ON invoices
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "invoices_insert_own" ON invoices
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "invoices_update_own" ON invoices
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "invoices_delete_own" ON invoices
  FOR DELETE
  USING (auth.uid() = user_id);

-- Payments: Users can only access their own payments
CREATE POLICY "payments_select_own" ON payments
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "payments_insert_own" ON payments
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "payments_update_own" ON payments
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "payments_delete_own" ON payments
  FOR DELETE
  USING (auth.uid() = user_id);

-- Matches: Users can only access their own matches
CREATE POLICY "matches_select_own" ON matches
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "matches_insert_own" ON matches
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "matches_update_own" ON matches
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "matches_delete_own" ON matches
  FOR DELETE
  USING (auth.uid() = user_id);
