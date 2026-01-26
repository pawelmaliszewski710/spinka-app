-- Migration: Create matches table
-- Created: 2026-01-26

CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  confidence_score DECIMAL(3,2) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  match_type match_type NOT NULL,
  matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  matched_by UUID REFERENCES auth.users(id),

  -- Each invoice can only have one match
  CONSTRAINT matches_invoice_unique UNIQUE (invoice_id),
  -- Each payment can only have one match
  CONSTRAINT matches_payment_unique UNIQUE (payment_id)
);

-- Indexes
CREATE INDEX idx_matches_user ON matches(user_id);
CREATE INDEX idx_matches_invoice ON matches(invoice_id);
CREATE INDEX idx_matches_payment ON matches(payment_id);
CREATE INDEX idx_matches_user_date ON matches(user_id, matched_at DESC);

COMMENT ON TABLE matches IS 'Dopasowania faktur do płatności';
COMMENT ON COLUMN matches.confidence_score IS 'Poziom pewności dopasowania (0.00-1.00)';
COMMENT ON COLUMN matches.match_type IS 'Typ dopasowania: auto (algorytm) lub manual (użytkownik)';
COMMENT ON COLUMN matches.matched_by IS 'ID użytkownika który dokonał ręcznego dopasowania';
