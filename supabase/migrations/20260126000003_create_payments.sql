-- Migration: Create payments table
-- Created: 2026-01-26

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'PLN',
  sender_name TEXT NOT NULL,
  sender_account TEXT,
  title TEXT NOT NULL,
  reference TEXT,
  source import_source NOT NULL,
  source_file TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique reference per user (if reference exists)
  CONSTRAINT payments_user_ref_unique UNIQUE (user_id, reference)
);

-- Indexes for common queries
CREATE INDEX idx_payments_user_date ON payments(user_id, transaction_date DESC);
CREATE INDEX idx_payments_user_amount ON payments(user_id, amount);
CREATE INDEX idx_payments_user_created ON payments(user_id, created_at DESC);

COMMENT ON TABLE payments IS 'Płatności/transakcje bankowe importowane z wyciągów';
COMMENT ON COLUMN payments.source IS 'Źródło importu: fakturownia, mt940, mbank, ing';
COMMENT ON COLUMN payments.reference IS 'Unikalny identyfikator transakcji z banku';
