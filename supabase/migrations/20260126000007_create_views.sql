-- Migration: Create views for common queries
-- Created: 2026-01-26

-- View: Dashboard summary (aggregated stats per user)
CREATE VIEW v_dashboard_summary AS
SELECT
  user_id,
  payment_status,
  COUNT(*)::INTEGER as invoice_count,
  COALESCE(SUM(gross_amount), 0)::DECIMAL(12,2) as total_amount
FROM invoices
GROUP BY user_id, payment_status;

COMMENT ON VIEW v_dashboard_summary IS 'Aggregated invoice counts and amounts by status for dashboard';

-- View: Overdue invoices with days calculation
CREATE VIEW v_overdue_invoices AS
SELECT
  i.*,
  (CURRENT_DATE - i.due_date)::INTEGER as days_overdue
FROM invoices i
WHERE i.payment_status = 'overdue'
ORDER BY i.due_date ASC;

COMMENT ON VIEW v_overdue_invoices IS 'Overdue invoices sorted by oldest first, with days overdue calculated';

-- View: Unmatched payments (available for matching)
CREATE VIEW v_unmatched_payments AS
SELECT p.*
FROM payments p
LEFT JOIN matches m ON m.payment_id = p.id
WHERE m.id IS NULL;

COMMENT ON VIEW v_unmatched_payments IS 'Payments without any match, available for manual or auto matching';

-- View: Unmatched invoices (pending or overdue without match)
CREATE VIEW v_unmatched_invoices AS
SELECT i.*
FROM invoices i
LEFT JOIN matches m ON m.invoice_id = i.id
WHERE m.id IS NULL
  AND i.payment_status IN ('pending', 'overdue');

COMMENT ON VIEW v_unmatched_invoices IS 'Invoices without any match, candidates for matching';

-- View: Matches with full details (for display)
CREATE VIEW v_matches_with_details AS
SELECT
  m.id,
  m.user_id,
  m.confidence_score,
  m.match_type,
  m.matched_at,
  m.matched_by,
  -- Invoice details
  i.id as invoice_id,
  i.invoice_number,
  i.gross_amount as invoice_amount,
  i.buyer_name,
  i.due_date,
  -- Payment details
  p.id as payment_id,
  p.transaction_date,
  p.amount as payment_amount,
  p.sender_name,
  p.title as payment_title
FROM matches m
JOIN invoices i ON i.id = m.invoice_id
JOIN payments p ON p.id = m.payment_id;

COMMENT ON VIEW v_matches_with_details IS 'Matches joined with invoice and payment details for display';
