-- Migration: Add Fakturownia API import fields
-- Created: 2026-01-26
-- Description: Adds fakturownia_id, invoice_kind columns and 'canceled' status for API import sync

-- Add 'canceled' value to payment_status enum
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'canceled';

-- Add fakturownia_id column for API sync (unique per invoice)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS fakturownia_id INTEGER;

-- Add invoice_kind column (vat, proforma, canceled, correction, etc.)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_kind TEXT DEFAULT 'vat';

-- Create index for faster lookups during reimport by fakturownia_id
CREATE INDEX IF NOT EXISTS idx_invoices_fakturownia_id
  ON invoices(fakturownia_id)
  WHERE fakturownia_id IS NOT NULL;

-- Create index for filtering by invoice_kind
CREATE INDEX IF NOT EXISTS idx_invoices_kind
  ON invoices(user_id, invoice_kind);

-- Update the unmatched invoices index to exclude canceled
DROP INDEX IF EXISTS idx_invoices_unmatched;
CREATE INDEX idx_invoices_unmatched ON invoices(user_id, gross_amount)
  WHERE payment_status IN ('pending', 'overdue', 'partial');

-- Add comments
COMMENT ON COLUMN invoices.fakturownia_id IS 'Original invoice ID from Fakturownia API for sync/upsert';
COMMENT ON COLUMN invoices.invoice_kind IS 'Invoice type from Fakturownia: vat, proforma, correction, canceled';
