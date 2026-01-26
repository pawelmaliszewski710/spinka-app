# Implementation Plan: InvoiceMatch - System Dopasowywania Faktur

**Branch**: `001-invoicematch-mvp` | **Date**: 2026-01-26 | **Spec**: `specs/001-invoicematch-mvp/spec.md`
**Input**: Feature specification from user requirements

## Summary

System do automatycznego dopasowywania faktur przychodowych do płatności bankowych dla małych firm i freelancerów. Użytkownik importuje faktury (CSV z Fakturownia.pl) oraz wyciągi bankowe (CSV/MT940), a system identyfikuje które faktury zostały opłacone, a które mają zaległości.

**Kluczowe funkcje MVP:**
- Import faktur z Fakturownia.pl (CSV)
- Import wyciągów bankowych (MT940 + CSV z 2 banków: mBank, ING)
- Algorytm automatycznego dopasowywania z confidence score
- Dashboard ze statusami faktur
- Lista zaległości z możliwością kopiowania

## Technical Context

| Aspect | Decision |
|--------|----------|
| **Language/Version** | TypeScript 5.x (strict mode) |
| **Frontend** | React 18 + Vite + Shadcn/ui + TailwindCSS |
| **Backend** | Supabase (PostgreSQL + Edge Functions) |
| **Hosting** | Vercel (frontend) + Supabase (backend) |
| **Auth** | Supabase Auth (email/password) |
| **Testing** | Playwright (E2E), Vitest (unit/integration) |
| **Target Platform** | Web (desktop-first, responsive) |

**Performance Goals** (per constitution):
- Dashboard load: <2s with 1000 invoices
- File parsing: <3s for 1000 records
- Matching algorithm: <5s for 500×500

**Constraints**:
- PLN only (MVP)
- Max 10MB file uploads
- 1000 invoices/payments realistic volume
- Synchronous processing (no background jobs)

## Constitution Check

*GATE: Must pass before implementation. Re-check after design changes.*

| Principle | Requirement | Status |
|-----------|-------------|--------|
| I. Code Quality | TypeScript strict, no `any`, explicit types | ✅ Will enforce |
| II. Test-First | E2E for flows, unit for parsers/matching | ✅ Planned |
| III. UX Consistency | Shadcn/ui, loading states, keyboard nav | ✅ Planned |
| IV. Performance | Benchmarks defined in constitution | ✅ Targets set |
| V. Security | RLS, tenant isolation, input validation | ✅ Critical path |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        VERCEL                                │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              React + Vite Frontend                   │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐            │    │
│  │  │Dashboard │ │ Invoices │ │ Payments │            │    │
│  │  └──────────┘ └──────────┘ └──────────┘            │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐            │    │
│  │  │ Matching │ │ Overdue  │ │  Import  │            │    │
│  │  └──────────┘ └──────────┘ └──────────┘            │    │
│  └─────────────────────┬───────────────────────────────┘    │
└─────────────────────────┼────────────────────────────────────┘
                          │ Supabase Client
┌─────────────────────────┼────────────────────────────────────┐
│                     SUPABASE                                  │
│  ┌─────────────────────┴───────────────────────────────┐    │
│  │                   Edge Functions                     │    │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐      │    │
│  │  │ parse-csv  │ │parse-mt940 │ │ auto-match │      │    │
│  │  └────────────┘ └────────────┘ └────────────┘      │    │
│  └─────────────────────┬───────────────────────────────┘    │
│  ┌─────────────────────┴───────────────────────────────┐    │
│  │              PostgreSQL + RLS                        │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐            │    │
│  │  │ invoices │ │ payments │ │ matches  │            │    │
│  │  └──────────┘ └──────────┘ └──────────┘            │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Supabase Auth                           │    │
│  │              (email/password)                        │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

## Project Structure

### Documentation (this feature)

```text
specs/001-invoicematch-mvp/
├── plan.md              # This file
├── spec.md              # Feature specification
├── data-model.md        # Database schema design
├── research.md          # Format analysis & algorithm research
├── contracts/           # API contracts
│   ├── invoices.md
│   ├── payments.md
│   └── matches.md
└── tasks.md             # Task breakdown (/speckit.tasks output)
```

### Source Code

```text
src/
├── components/              # React components (Shadcn/ui based)
│   ├── ui/                 # Shadcn primitives (auto-generated)
│   ├── layout/             # Layout components
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   └── PageContainer.tsx
│   ├── dashboard/          # Dashboard widgets
│   │   ├── StatCard.tsx
│   │   ├── SummaryCards.tsx
│   │   └── RecentActivity.tsx
│   ├── invoices/           # Invoice components
│   │   ├── InvoiceTable.tsx
│   │   ├── InvoiceRow.tsx
│   │   ├── InvoiceFilters.tsx
│   │   └── InvoiceStatusBadge.tsx
│   ├── payments/           # Payment components
│   │   ├── PaymentTable.tsx
│   │   ├── PaymentRow.tsx
│   │   └── PaymentFilters.tsx
│   ├── matching/           # Matching UI
│   │   ├── MatchSuggestion.tsx
│   │   ├── MatchConfidence.tsx
│   │   ├── ManualMatchDialog.tsx
│   │   └── MatchHistory.tsx
│   ├── import/             # Import wizards
│   │   ├── ImportDialog.tsx
│   │   ├── FileDropzone.tsx
│   │   ├── ImportPreview.tsx
│   │   └── ImportProgress.tsx
│   └── overdue/            # Overdue list
│       ├── OverdueTable.tsx
│       ├── OverdueRow.tsx
│       └── CopyListButton.tsx
├── pages/                  # Route pages
│   ├── LoginPage.tsx
│   ├── RegisterPage.tsx
│   ├── DashboardPage.tsx
│   ├── InvoicesPage.tsx
│   ├── PaymentsPage.tsx
│   ├── MatchingPage.tsx
│   └── OverduePage.tsx
├── hooks/                  # Custom React hooks
│   ├── useAuth.ts
│   ├── useInvoices.ts
│   ├── usePayments.ts
│   ├── useMatches.ts
│   ├── useDashboard.ts
│   └── useImport.ts
├── lib/                    # Utilities & business logic
│   ├── supabase.ts        # Supabase client config
│   ├── utils.ts           # General utilities
│   ├── constants.ts       # App constants
│   ├── parsers/           # File parsers (client-side preview)
│   │   ├── types.ts
│   │   ├── fakturownia.ts
│   │   ├── mt940.ts
│   │   ├── mbank.ts
│   │   └── ing.ts
│   └── matching/          # Matching utilities (client display)
│       ├── types.ts
│       └── confidence.ts
├── types/                  # TypeScript interfaces
│   ├── invoice.ts
│   ├── payment.ts
│   ├── match.ts
│   ├── import.ts
│   └── database.ts        # Supabase generated types
└── App.tsx

supabase/
├── functions/              # Edge Functions
│   ├── import-invoices/   # Parse & import invoices
│   │   └── index.ts
│   ├── import-payments/   # Parse & import payments
│   │   └── index.ts
│   └── auto-match/        # Run matching algorithm
│       └── index.ts
├── migrations/            # Database migrations
│   ├── 20260126000001_create_invoices.sql
│   ├── 20260126000002_create_payments.sql
│   ├── 20260126000003_create_matches.sql
│   └── 20260126000004_enable_rls.sql
└── seed.sql               # Test data for development

tests/
├── e2e/                   # Playwright E2E tests
│   ├── auth.spec.ts
│   ├── import-invoices.spec.ts
│   ├── import-payments.spec.ts
│   ├── matching.spec.ts
│   ├── dashboard.spec.ts
│   └── overdue.spec.ts
├── integration/           # Integration tests
│   ├── edge-functions/
│   │   ├── import-invoices.test.ts
│   │   ├── import-payments.test.ts
│   │   └── auto-match.test.ts
│   └── supabase/
│       └── rls.test.ts
└── unit/                  # Unit tests
    ├── parsers/
    │   ├── fakturownia.test.ts
    │   ├── mt940.test.ts
    │   ├── mbank.test.ts
    │   └── ing.test.ts
    ├── matching/
    │   └── confidence.test.ts
    └── utils/
        └── utils.test.ts

public/
└── sample-files/          # Sample files for testing
    ├── fakturownia-sample.csv
    ├── mt940-sample.sta
    ├── mbank-sample.csv
    └── ing-sample.csv
```

**Structure Decision**: Web application with React frontend on Vercel and Supabase backend. File parsing happens in Edge Functions (server-side) for security and consistency. Client-side parsers only for preview before upload.

---

## Phase 0: Research

### 0.1 File Format Analysis

#### Fakturownia.pl CSV Export
```csv
"Numer";"Data wystawienia";"Termin płatności";"Netto";"Brutto";"Waluta";"Nabywca";"NIP"
"FV/2024/001";"2024-01-15";"2024-01-29";"1000.00";"1230.00";"PLN";"Acme Sp. z o.o.";"1234567890"
```
- **Encoding**: UTF-8 (sometimes with BOM)
- **Delimiter**: semicolon (;)
- **Date format**: YYYY-MM-DD
- **Amount format**: decimal with dot (.)
- **Quotes**: optional, required if value contains delimiter

#### MT940 Format (Universal Bank Statement)
```
:20:STARTUMS
:25:PL12345678901234567890123456
:28C:00001/001
:60F:C240115PLN10000,00
:61:2401150115C1230,00NTRF//REFERENCE
:86:020 Przelew przychodzący
Nadawca: ACME SP Z O O
Tytuł: Zapłata za fakturę FV/2024/001
:62F:C240115PLN11230,00
```
- **:61:** Transaction line: YYMMDD[YYMMDD]D/C[Amount]
- **:86:** Transaction details (multiline)
- **Amount**: no decimal separator, last 2 digits are grosze

#### mBank CSV
```csv
#Data operacji;#Data księgowania;#Opis operacji;#Tytuł;#Nadawca/Odbiorca;#Numer konta;#Kwota;#Saldo po operacji;
2024-01-15;2024-01-15;PRZELEW PRZYCHODZĄCY;Zapłata za FV/2024/001;ACME SP Z O O;PL12345678901234567890123456;1230,00;11230,00;
```
- **Encoding**: CP1250 or UTF-8
- **Delimiter**: semicolon
- **Amount**: decimal with comma (,)
- **Header**: starts with #

#### ING CSV
```csv
Data transakcji;Data księgowania;Dane kontrahenta;Tytuł;Nr rachunku;Kwota transakcji;Waluta;
2024-01-15;2024-01-15;ACME SP Z O O;Zapłata za FV/2024/001;PL12345678901234567890123456;1230,00;PLN;
```
- **Encoding**: UTF-8
- **Delimiter**: semicolon
- **Amount**: decimal with comma (,)

### 0.2 Matching Algorithm

#### Matching Criteria & Weights

| Criterion | Weight | Description |
|-----------|--------|-------------|
| **Exact amount** | 0.40 | Kwota brutto ±0.01 PLN |
| **Invoice number in title** | 0.30 | Regex: `/FV[\/\-]?\s*\d+[\/\-]?\d*/i` |
| **Name similarity** | 0.15 | Levenshtein distance normalized or contains |
| **NIP in title** | 0.10 | Regex: `/\d{10}/` matching buyer NIP |
| **Date proximity** | 0.05 | Payment within ±30 days of due date |

#### Confidence Score Calculation

```typescript
function calculateConfidence(invoice: Invoice, payment: Payment): number {
  let score = 0;

  // Amount match (weight: 0.40)
  if (Math.abs(invoice.gross_amount - payment.amount) <= 0.01) {
    score += 0.40;
  }

  // Invoice number in title (weight: 0.30)
  const invoicePattern = new RegExp(
    invoice.invoice_number.replace(/[\/\-]/g, '[\\/-]?\\s*'),
    'i'
  );
  if (invoicePattern.test(payment.title)) {
    score += 0.30;
  }

  // Name similarity (weight: 0.15)
  const nameSimilarity = calculateNameSimilarity(
    invoice.buyer_name,
    payment.sender_name
  );
  score += 0.15 * nameSimilarity;

  // NIP in title (weight: 0.10)
  if (invoice.buyer_nip && payment.title.includes(invoice.buyer_nip)) {
    score += 0.10;
  }

  // Date proximity (weight: 0.05)
  const daysDiff = Math.abs(
    differenceInDays(payment.transaction_date, invoice.due_date)
  );
  if (daysDiff <= 30) {
    score += 0.05 * (1 - daysDiff / 30);
  }

  return score;
}
```

#### Confidence Thresholds

| Score | Classification | Action |
|-------|---------------|--------|
| ≥0.85 | High confidence | Auto-match (mark as `auto`) |
| 0.60-0.84 | Medium confidence | Suggest to user (no auto-action) |
| <0.60 | Low confidence | No match suggested |

### 0.3 Security Model

#### Row Level Security (RLS) Policies

```sql
-- All tables have user_id column
-- Policy pattern for all tables:
CREATE POLICY "Users can only access own data" ON table_name
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

#### Edge Function Authentication

```typescript
// Every Edge Function must verify auth
const { data: { user }, error } = await supabaseClient.auth.getUser();
if (error || !user) {
  return new Response('Unauthorized', { status: 401 });
}
// Use user.id for all database operations
```

---

## Phase 1: Data Model

### Database Schema

```sql
-- Enum types
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'overdue', 'partial');
CREATE TYPE match_type AS ENUM ('auto', 'manual');
CREATE TYPE import_source AS ENUM ('fakturownia', 'mt940', 'mbank', 'ing');

-- Invoices table
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

-- Payments table
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

-- Matches table
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

-- Indexes for performance
CREATE INDEX idx_invoices_user_status ON invoices(user_id, payment_status);
CREATE INDEX idx_invoices_user_due_date ON invoices(user_id, due_date);
CREATE INDEX idx_payments_user_date ON payments(user_id, transaction_date);
CREATE INDEX idx_matches_user ON matches(user_id);

-- RLS Policies
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_user_policy" ON invoices
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "payments_user_policy" ON payments
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "matches_user_policy" ON matches
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### TypeScript Types

```typescript
// types/invoice.ts
export interface Invoice {
  id: string;
  user_id: string;
  invoice_number: string;
  issue_date: string; // ISO date
  due_date: string;
  gross_amount: number;
  net_amount: number;
  currency: string;
  buyer_name: string;
  buyer_nip: string | null;
  payment_status: 'pending' | 'paid' | 'overdue' | 'partial';
  created_at: string;
  updated_at: string;
}

// types/payment.ts
export interface Payment {
  id: string;
  user_id: string;
  transaction_date: string;
  amount: number;
  currency: string;
  sender_name: string;
  sender_account: string | null;
  title: string;
  reference: string | null;
  source: 'fakturownia' | 'mt940' | 'mbank' | 'ing';
  source_file: string | null;
  created_at: string;
}

// types/match.ts
export interface Match {
  id: string;
  user_id: string;
  invoice_id: string;
  payment_id: string;
  confidence_score: number;
  match_type: 'auto' | 'manual';
  matched_at: string;
  matched_by: string | null;
}

export interface MatchWithDetails extends Match {
  invoice: Invoice;
  payment: Payment;
}

export interface MatchSuggestion {
  invoice: Invoice;
  payment: Payment;
  confidence_score: number;
  match_reasons: string[];
}
```

---

## User Stories (Priority Order)

### US1: Rejestracja i logowanie (P0) - Blocker
**Goal**: Użytkownik może utworzyć konto i zalogować się
**Independent Test**: Rejestracja → potwierdzenie email → logowanie → dostęp do dashboardu
**Acceptance**:
- Given nowy użytkownik, When rejestruje się z email/hasłem, Then otrzymuje potwierdzenie i może się zalogować
- Given zalogowany użytkownik, When wyloguje się, Then traci dostęp do danych

### US2: Import faktur z Fakturownia.pl (P1) 🎯 MVP Core
**Goal**: Użytkownik może zaimportować faktury z pliku CSV
**Independent Test**: Upload CSV z 10 fakturami → wszystkie widoczne na liście z poprawnymi danymi
**Acceptance**:
- Given plik CSV z Fakturownia.pl, When użytkownik uploaduje plik, Then widzi podgląd danych przed importem
- Given podgląd importu, When użytkownik potwierdza, Then faktury zapisują się w bazie
- Given niepoprawny plik, When użytkownik uploaduje, Then widzi zrozumiały komunikat błędu

### US3: Import płatności bankowych (P1) 🎯 MVP Core
**Goal**: Użytkownik może zaimportować wyciąg bankowy (MT940 lub CSV)
**Independent Test**: Upload wyciągu z 20 transakcjami → wszystkie widoczne z poprawnymi danymi
**Acceptance**:
- Given plik MT940, When użytkownik uploaduje, Then transakcje są poprawnie sparsowane
- Given plik CSV z mBank, When użytkownik uploaduje, Then transakcje są poprawnie sparsowane
- Given plik CSV z ING, When użytkownik uploaduje, Then transakcje są poprawnie sparsowane

### US4: Automatyczne dopasowywanie (P1) 🎯 MVP Core
**Goal**: System automatycznie łączy faktury z płatnościami
**Independent Test**: 5 faktur + 5 płatności → min. 3 poprawne auto-matche z confidence ≥0.85
**Acceptance**:
- Given faktury i płatności w systemie, When użytkownik uruchamia auto-match, Then system tworzy dopasowania z confidence score
- Given high-confidence match (≥0.85), Then faktura automatycznie zmienia status na 'paid'
- Given medium-confidence match (0.60-0.84), Then dopasowanie jest sugerowane do akceptacji

### US5: Dashboard ze statusami (P2)
**Goal**: Użytkownik widzi podsumowanie finansów
**Independent Test**: Dashboard pokazuje poprawne sumy dla każdego statusu
**Acceptance**:
- Given zalogowany użytkownik z danymi, When otwiera dashboard, Then widzi karty: Opłacone, Oczekujące, Zaległe
- Given karty statusów, When klika na kartę, Then przechodzi do filtrowanej listy faktur

### US6: Lista zaległości z kopiowaniem (P2)
**Goal**: Dedykowany widok zaległości z możliwością skopiowania
**Independent Test**: Lista zaległych faktur → kliknięcie "Kopiuj" → dane w schowku
**Acceptance**:
- Given faktury po terminie, When użytkownik otwiera "Zaległości", Then widzi listę posortowaną od najstarszych
- Given lista zaległości, When klika "Kopiuj listę", Then dane kopiują się do schowka w formacie tabelarycznym

### US7: Ręczna korekta dopasowań (P3)
**Goal**: Użytkownik może ręcznie połączyć/rozłączyć fakturę z płatnością
**Independent Test**: Usunięcie auto-matcha → utworzenie manual matcha
**Acceptance**:
- Given istniejący match, When użytkownik klika "Rozłącz", Then match jest usuwany, faktura wraca do 'pending'
- Given faktura bez matcha i wolna płatność, When użytkownik tworzy manual match, Then match jest zapisywany jako 'manual'

---

## Complexity Tracking

| Decision | Why Needed | Simpler Alternative Rejected |
|----------|------------|------------------------------|
| Edge Functions for parsing | Security (server-side validation), consistency | Client-side only would be less secure |
| Confidence scoring | User trust in auto-matches | Binary match would have more errors |
| 4 parser implementations | User requirement (MT940 + 2 banks) | Single format would limit adoption |
| Client-side preview | Better UX (instant feedback) | Server-only would add latency for preview |

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Różne warianty formatów CSV | High | Medium | Extensive test files, graceful error handling |
| Błędne auto-dopasowania | Medium | Medium | Confidence scores, easy manual override, audit log |
| Performance z dużą ilością danych | Medium | Low | Pagination, indexes, streaming for large files |
| RLS misconfiguration | Critical | Low | Comprehensive security tests, Supabase advisor |
| File encoding issues | Medium | Medium | Encoding detection, UTF-8 normalization |

---

## Next Steps

1. **Create spec.md** with detailed user stories and acceptance criteria
2. **Create data-model.md** with full schema documentation
3. **Run `/speckit.tasks`** to generate detailed task breakdown
4. **Setup project** with Vite + React + TypeScript + Supabase
5. **Create database schema** with migrations and RLS
6. **Implement Edge Functions** for parsing and matching
7. **Build UI** following Shadcn/ui patterns

---

**Plan Version**: 1.1 | **Created**: 2026-01-26 | **Status**: Ready for spec and tasks generation
