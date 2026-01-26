# Data Model: InvoiceMatch MVP

**Feature**: 001-invoicematch-mvp
**Created**: 2026-01-26
**Database**: Supabase PostgreSQL

## Entity Relationship Diagram

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   auth.users    │       │    invoices     │       │    payments     │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id (PK)         │───┐   │ id (PK)         │       │ id (PK)         │
│ email           │   │   │ user_id (FK)────│───────│ user_id (FK)────│───┐
│ ...             │   │   │ invoice_number  │       │ transaction_date│   │
└─────────────────┘   │   │ issue_date      │       │ amount          │   │
                      │   │ due_date        │       │ currency        │   │
                      │   │ gross_amount    │   ┌───│ sender_name     │   │
                      │   │ net_amount      │   │   │ sender_account  │   │
                      │   │ currency        │   │   │ title           │   │
                      │   │ buyer_name      │   │   │ reference       │   │
                      │   │ buyer_nip       │   │   │ source          │   │
                      │   │ payment_status  │   │   │ source_file     │   │
                      │   │ created_at      │   │   │ created_at      │   │
                      │   │ updated_at      │   │   └─────────────────┘   │
                      │   └─────────────────┘   │                         │
                      │           │             │                         │
                      │           │ 1:1         │ 1:1                     │
                      │           │             │                         │
                      │   ┌───────┴─────────────┴───────┐                 │
                      │   │         matches             │                 │
                      │   ├─────────────────────────────┤                 │
                      │   │ id (PK)                     │                 │
                      └───│ user_id (FK)                │─────────────────┘
                          │ invoice_id (FK, UNIQUE)     │
                          │ payment_id (FK, UNIQUE)     │
                          │ confidence_score            │
                          │ match_type                  │
                          │ matched_at                  │
                          │ matched_by (FK)             │
                          └─────────────────────────────┘
```

## Enum Types

### payment_status
Status faktury w kontekście płatności.

| Value | Description |
|-------|-------------|
| `pending` | Oczekuje na płatność (przed terminem) |
| `paid` | Opłacona (ma dopasowanie) |
| `overdue` | Po terminie płatności (brak dopasowania) |
| `partial` | Częściowo opłacona (przyszłość - MVP nie wspiera) |

### match_type
Sposób utworzenia dopasowania.

| Value | Description |
|-------|-------------|
| `auto` | Automatyczne dopasowanie przez algorytm |
| `manual` | Ręczne dopasowanie przez użytkownika |

### import_source
Źródło importu płatności.

| Value | Description |
|-------|-------------|
| `fakturownia` | CSV z Fakturownia.pl (faktury) |
| `mt940` | Format MT940 (wyciąg bankowy) |
| `mbank` | CSV z mBank |
| `ing` | CSV z ING |

---

## Tables

### invoices

Faktury przychodowe zaimportowane z Fakturownia.pl.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | Unikalny identyfikator |
| `user_id` | `UUID` | NOT NULL, FK → auth.users | Właściciel faktury |
| `invoice_number` | `TEXT` | NOT NULL | Numer faktury (np. FV/2024/001) |
| `issue_date` | `DATE` | NOT NULL | Data wystawienia |
| `due_date` | `DATE` | NOT NULL | Termin płatności |
| `gross_amount` | `DECIMAL(12,2)` | NOT NULL | Kwota brutto |
| `net_amount` | `DECIMAL(12,2)` | NOT NULL | Kwota netto |
| `currency` | `TEXT` | NOT NULL, DEFAULT 'PLN' | Waluta (MVP: tylko PLN) |
| `buyer_name` | `TEXT` | NOT NULL | Nazwa nabywcy |
| `buyer_nip` | `TEXT` | NULL | NIP nabywcy (opcjonalny) |
| `payment_status` | `payment_status` | NOT NULL, DEFAULT 'pending' | Status płatności |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Data utworzenia rekordu |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Data ostatniej modyfikacji |

**Constraints:**
- `UNIQUE (user_id, invoice_number)` - unikalny numer faktury per użytkownik

**Indexes:**
- `idx_invoices_user_status` ON (user_id, payment_status)
- `idx_invoices_user_due_date` ON (user_id, due_date)

---

### payments

Płatności (transakcje bankowe) zaimportowane z wyciągów.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | Unikalny identyfikator |
| `user_id` | `UUID` | NOT NULL, FK → auth.users | Właściciel płatności |
| `transaction_date` | `DATE` | NOT NULL | Data transakcji |
| `amount` | `DECIMAL(12,2)` | NOT NULL | Kwota transakcji |
| `currency` | `TEXT` | NOT NULL, DEFAULT 'PLN' | Waluta |
| `sender_name` | `TEXT` | NOT NULL | Nazwa nadawcy |
| `sender_account` | `TEXT` | NULL | Numer konta nadawcy |
| `title` | `TEXT` | NOT NULL | Tytuł przelewu |
| `reference` | `TEXT` | NULL | Referencja/ID transakcji (unikalny) |
| `source` | `import_source` | NOT NULL | Źródło importu |
| `source_file` | `TEXT` | NULL | Nazwa pliku źródłowego |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Data utworzenia rekordu |

**Constraints:**
- `UNIQUE (user_id, reference)` - unikalna referencja per użytkownik (jeśli dostępna)

**Indexes:**
- `idx_payments_user_date` ON (user_id, transaction_date)
- `idx_payments_user_amount` ON (user_id, amount)

---

### matches

Powiązania między fakturami a płatnościami.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | Unikalny identyfikator |
| `user_id` | `UUID` | NOT NULL, FK → auth.users | Właściciel dopasowania |
| `invoice_id` | `UUID` | NOT NULL, FK → invoices | Powiązana faktura |
| `payment_id` | `UUID` | NOT NULL, FK → payments | Powiązana płatność |
| `confidence_score` | `DECIMAL(3,2)` | NOT NULL, CHECK (0..1) | Poziom pewności (0.00-1.00) |
| `match_type` | `match_type` | NOT NULL | Typ dopasowania (auto/manual) |
| `matched_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Data dopasowania |
| `matched_by` | `UUID` | NULL, FK → auth.users | Kto dopasował (dla manual) |

**Constraints:**
- `UNIQUE (invoice_id)` - jedna faktura = jedno dopasowanie
- `UNIQUE (payment_id)` - jedna płatność = jedno dopasowanie

**Indexes:**
- `idx_matches_user` ON (user_id)
- `idx_matches_invoice` ON (invoice_id)
- `idx_matches_payment` ON (payment_id)

---

## Row Level Security (RLS)

### Policy Pattern

Wszystkie tabele używają tego samego wzorca RLS:

```sql
-- Enable RLS
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

-- Policy for all operations
CREATE POLICY "Users can only access own data" ON table_name
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### Specific Policies

```sql
-- invoices
CREATE POLICY "invoices_user_policy" ON invoices
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- payments
CREATE POLICY "payments_user_policy" ON payments
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- matches
CREATE POLICY "matches_user_policy" ON matches
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

---

## Triggers

### updated_at Auto-Update

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

### Invoice Status Update on Match

```sql
-- When a match is created, update invoice status to 'paid'
CREATE OR REPLACE FUNCTION update_invoice_status_on_match()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE invoices
    SET payment_status = 'paid', updated_at = NOW()
    WHERE id = NEW.invoice_id;
  ELSIF TG_OP = 'DELETE' THEN
    -- On unmatch, recalculate status (pending or overdue)
    UPDATE invoices
    SET payment_status = CASE
      WHEN due_date < CURRENT_DATE THEN 'overdue'
      ELSE 'pending'
    END,
    updated_at = NOW()
    WHERE id = OLD.invoice_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER matches_update_invoice_status
  AFTER INSERT OR DELETE ON matches
  FOR EACH ROW
  EXECUTE FUNCTION update_invoice_status_on_match();
```

### Overdue Status Cron Job

```sql
-- Daily job to mark invoices as overdue
-- Run via Supabase pg_cron or Edge Function scheduled task

CREATE OR REPLACE FUNCTION mark_overdue_invoices()
RETURNS void AS $$
BEGIN
  UPDATE invoices
  SET payment_status = 'overdue', updated_at = NOW()
  WHERE payment_status = 'pending'
    AND due_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- Schedule: SELECT cron.schedule('mark-overdue', '0 1 * * *', 'SELECT mark_overdue_invoices()');
```

---

## Views

### v_dashboard_summary

Agregacja dla dashboardu.

```sql
CREATE VIEW v_dashboard_summary AS
SELECT
  user_id,
  payment_status,
  COUNT(*) as invoice_count,
  COALESCE(SUM(gross_amount), 0) as total_amount
FROM invoices
GROUP BY user_id, payment_status;
```

### v_overdue_invoices

Faktury zaległe z obliczoną liczbą dni.

```sql
CREATE VIEW v_overdue_invoices AS
SELECT
  i.*,
  CURRENT_DATE - i.due_date as days_overdue
FROM invoices i
WHERE i.payment_status = 'overdue'
ORDER BY i.due_date ASC;
```

### v_unmatched_payments

Płatności bez dopasowania.

```sql
CREATE VIEW v_unmatched_payments AS
SELECT p.*
FROM payments p
LEFT JOIN matches m ON m.payment_id = p.id
WHERE m.id IS NULL;
```

---

## Migration Files

### 20260126000001_create_enums.sql

```sql
-- Create enum types
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'overdue', 'partial');
CREATE TYPE match_type AS ENUM ('auto', 'manual');
CREATE TYPE import_source AS ENUM ('fakturownia', 'mt940', 'mbank', 'ing');
```

### 20260126000002_create_invoices.sql

```sql
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

  CONSTRAINT invoices_user_invoice_unique UNIQUE (user_id, invoice_number)
);

CREATE INDEX idx_invoices_user_status ON invoices(user_id, payment_status);
CREATE INDEX idx_invoices_user_due_date ON invoices(user_id, due_date);
```

### 20260126000003_create_payments.sql

```sql
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

  CONSTRAINT payments_user_ref_unique UNIQUE (user_id, reference)
);

CREATE INDEX idx_payments_user_date ON payments(user_id, transaction_date);
CREATE INDEX idx_payments_user_amount ON payments(user_id, amount);
```

### 20260126000004_create_matches.sql

```sql
CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  confidence_score DECIMAL(3,2) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  match_type match_type NOT NULL,
  matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  matched_by UUID REFERENCES auth.users(id),

  CONSTRAINT matches_invoice_unique UNIQUE (invoice_id),
  CONSTRAINT matches_payment_unique UNIQUE (payment_id)
);

CREATE INDEX idx_matches_user ON matches(user_id);
CREATE INDEX idx_matches_invoice ON matches(invoice_id);
CREATE INDEX idx_matches_payment ON matches(payment_id);
```

### 20260126000005_enable_rls.sql

```sql
-- Enable RLS on all tables
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "invoices_user_policy" ON invoices
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "payments_user_policy" ON payments
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "matches_user_policy" ON matches
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### 20260126000006_create_triggers.sql

```sql
-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Match status sync trigger
CREATE OR REPLACE FUNCTION update_invoice_status_on_match()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE invoices
    SET payment_status = 'paid', updated_at = NOW()
    WHERE id = NEW.invoice_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE invoices
    SET payment_status = CASE
      WHEN due_date < CURRENT_DATE THEN 'overdue'
      ELSE 'pending'
    END,
    updated_at = NOW()
    WHERE id = OLD.invoice_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER matches_update_invoice_status
  AFTER INSERT OR DELETE ON matches
  FOR EACH ROW
  EXECUTE FUNCTION update_invoice_status_on_match();

-- Overdue marking function (for scheduled job)
CREATE OR REPLACE FUNCTION mark_overdue_invoices()
RETURNS void AS $$
BEGIN
  UPDATE invoices
  SET payment_status = 'overdue', updated_at = NOW()
  WHERE payment_status = 'pending'
    AND due_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;
```

### 20260126000007_create_views.sql

```sql
CREATE VIEW v_dashboard_summary AS
SELECT
  user_id,
  payment_status,
  COUNT(*) as invoice_count,
  COALESCE(SUM(gross_amount), 0) as total_amount
FROM invoices
GROUP BY user_id, payment_status;

CREATE VIEW v_overdue_invoices AS
SELECT
  i.*,
  CURRENT_DATE - i.due_date as days_overdue
FROM invoices i
WHERE i.payment_status = 'overdue'
ORDER BY i.due_date ASC;

CREATE VIEW v_unmatched_payments AS
SELECT p.*
FROM payments p
LEFT JOIN matches m ON m.payment_id = p.id
WHERE m.id IS NULL;
```

---

## Sample Data (seed.sql)

```sql
-- Sample invoices for testing (user_id must be replaced with actual auth.uid())
-- This is for local development only

INSERT INTO invoices (user_id, invoice_number, issue_date, due_date, gross_amount, net_amount, buyer_name, buyer_nip, payment_status)
VALUES
  ('USER_ID', 'FV/2024/001', '2024-01-01', '2024-01-15', 1230.00, 1000.00, 'Acme Sp. z o.o.', '1234567890', 'pending'),
  ('USER_ID', 'FV/2024/002', '2024-01-05', '2024-01-19', 2460.00, 2000.00, 'Beta Ltd', '0987654321', 'pending'),
  ('USER_ID', 'FV/2024/003', '2024-01-10', '2024-01-24', 615.00, 500.00, 'Gamma S.A.', '1122334455', 'pending');

INSERT INTO payments (user_id, transaction_date, amount, sender_name, sender_account, title, reference, source)
VALUES
  ('USER_ID', '2024-01-14', 1230.00, 'ACME SP Z O O', 'PL12345678901234567890123456', 'Zapłata za fakturę FV/2024/001', 'REF001', 'mt940'),
  ('USER_ID', '2024-01-20', 2460.00, 'BETA LTD', 'PL98765432109876543210987654', 'Płatność FV/2024/002', 'REF002', 'mbank');
```
