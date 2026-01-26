-- Migration: Create invoices table
-- Created: 2026-01-26

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  gross_amount DECIMAL(12,2) NOT NULL,
  net_amount DECIMAL(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'PLN',
  buyer_name TEXT NOT NULL,
  buyer_nip TEXT,
  payment_status payment_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique invoice number per user
  CONSTRAINT invoices_user_invoice_unique UNIQUE (user_id, invoice_number)
);

-- Indexes for common queries
CREATE INDEX idx_invoices_user_status ON invoices(user_id, payment_status);
CREATE INDEX idx_invoices_user_due_date ON invoices(user_id, due_date);
CREATE INDEX idx_invoices_user_created ON invoices(user_id, created_at DESC);

-- Index for matching algorithm (unmatched invoices by amount)
CREATE INDEX idx_invoices_unmatched ON invoices(user_id, gross_amount)
  WHERE payment_status IN ('pending', 'overdue');

COMMENT ON TABLE invoices IS 'Faktury przychodowe importowane z Fakturownia.pl';
COMMENT ON COLUMN invoices.payment_status IS 'Status płatności: pending, paid, overdue, partial';
COMMENT ON COLUMN invoices.buyer_nip IS 'NIP nabywcy (opcjonalny)';
