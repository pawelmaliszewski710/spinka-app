-- Migration: Create triggers for automatic updates
-- Created: 2026-01-26

-- Function: Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Update invoices.updated_at on any update
CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Function: Update invoice status when match is created/deleted
CREATE OR REPLACE FUNCTION update_invoice_status_on_match()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- When match is created, mark invoice as paid
    UPDATE invoices
    SET payment_status = 'paid', updated_at = NOW()
    WHERE id = NEW.invoice_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- When match is deleted, recalculate status based on due_date
    UPDATE invoices
    SET payment_status = CASE
      WHEN due_date < CURRENT_DATE THEN 'overdue'
      ELSE 'pending'
    END,
    updated_at = NOW()
    WHERE id = OLD.invoice_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Sync invoice status with matches
CREATE TRIGGER matches_update_invoice_status
  AFTER INSERT OR DELETE ON matches
  FOR EACH ROW
  EXECUTE FUNCTION update_invoice_status_on_match();

-- Function: Mark overdue invoices (for scheduled job)
CREATE OR REPLACE FUNCTION mark_overdue_invoices()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE invoices
  SET payment_status = 'overdue', updated_at = NOW()
  WHERE payment_status = 'pending'
    AND due_date < CURRENT_DATE;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION mark_overdue_invoices IS 'Marks pending invoices as overdue if past due_date. Run daily via cron or Edge Function.';
