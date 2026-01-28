-- Migration: Fix payments unique constraint to be per company instead of per user
-- Created: 2026-01-27

-- Drop old constraint (user_id, reference)
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_user_reference_unique;

-- Add new constraint (company_id, reference) - payments should be unique per company
ALTER TABLE payments ADD CONSTRAINT payments_company_reference_unique UNIQUE (company_id, reference);
