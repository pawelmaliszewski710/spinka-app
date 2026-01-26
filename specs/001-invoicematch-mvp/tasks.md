# Tasks: InvoiceMatch MVP

**Input**: Design documents from `specs/001-invoicematch-mvp/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/api.md ✅

**Tests**: Included per constitution (Test-First Development principle)

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, etc.)
- Exact file paths included in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Initialize Vite + React + TypeScript project with strict mode in `package.json`, `tsconfig.json`, `vite.config.ts`
- [ ] T002 [P] Install and configure TailwindCSS in `tailwind.config.js`, `src/index.css`
- [ ] T003 [P] Install and configure Shadcn/ui, run `npx shadcn-ui@latest init`
- [ ] T004 [P] Configure ESLint + Prettier in `.eslintrc.cjs`, `.prettierrc`
- [ ] T005 [P] Setup Vitest for unit/integration tests in `vitest.config.ts`
- [ ] T006 [P] Setup Playwright for E2E tests in `playwright.config.ts`
- [ ] T007 Initialize Supabase project, create `.env.local` with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- [ ] T008 Create Supabase client configuration in `src/lib/supabase.ts`
- [ ] T009 [P] Create sample test files in `public/sample-files/` (fakturownia-sample.csv, mt940-sample.sta, mbank-sample.csv, ing-sample.csv)

**Checkpoint**: Project builds and runs with `npm run dev`

---

## Phase 2: Database & Types (Foundational)

**Purpose**: Database schema and TypeScript types - BLOCKS all user stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T010 Create migration `supabase/migrations/20260126000001_create_enums.sql` with payment_status, match_type, import_source enums
- [ ] T011 Create migration `supabase/migrations/20260126000002_create_invoices.sql` with invoices table, indexes
- [ ] T012 Create migration `supabase/migrations/20260126000003_create_payments.sql` with payments table, indexes
- [ ] T013 Create migration `supabase/migrations/20260126000004_create_matches.sql` with matches table, constraints
- [ ] T014 Create migration `supabase/migrations/20260126000005_enable_rls.sql` with RLS policies for all tables
- [ ] T015 Create migration `supabase/migrations/20260126000006_create_triggers.sql` with updated_at trigger, match status sync trigger
- [ ] T016 Create migration `supabase/migrations/20260126000007_create_views.sql` with v_dashboard_summary, v_overdue_invoices, v_unmatched_payments
- [ ] T017 Apply migrations to Supabase: `npx supabase db push`
- [ ] T018 Generate TypeScript types: `npx supabase gen types typescript > src/types/database.ts`
- [ ] T019 [P] Create `src/types/invoice.ts` with Invoice interface
- [ ] T020 [P] Create `src/types/payment.ts` with Payment interface
- [ ] T021 [P] Create `src/types/match.ts` with Match, MatchWithDetails, MatchSuggestion interfaces
- [ ] T022 [P] Create `src/types/import.ts` with ImportResult, ImportError interfaces
- [ ] T023 Create `src/lib/constants.ts` with app constants (MAX_FILE_SIZE, CONFIDENCE_THRESHOLDS, etc.)
- [ ] T024 Create `src/lib/utils.ts` with formatCurrency, formatDate, normalizeNip utilities

**Checkpoint**: Database ready, types generated, `npx supabase db push` succeeds

---

## Phase 3: User Story 1 - Rejestracja i logowanie (Priority: P0) 🔒 Blocker

**Goal**: Użytkownik może utworzyć konto i zalogować się

**Independent Test**: Rejestracja → logowanie → widok dashboardu (pusty)

### Tests for US1

- [ ] T025 [P] [US1] E2E test for registration flow in `tests/e2e/auth.spec.ts`
- [ ] T026 [P] [US1] E2E test for login/logout flow in `tests/e2e/auth.spec.ts`
- [ ] T027 [P] [US1] Integration test for RLS policies in `tests/integration/supabase/rls.test.ts`

### Implementation for US1

- [ ] T028 [US1] Create `src/hooks/useAuth.ts` with signUp, signIn, signOut, user state
- [ ] T029 [P] [US1] Add Shadcn components: Button, Input, Card, Form, Label via `npx shadcn-ui@latest add`
- [ ] T030 [US1] Create `src/pages/LoginPage.tsx` with login form, error handling, redirect
- [ ] T031 [US1] Create `src/pages/RegisterPage.tsx` with registration form, validation
- [ ] T032 [US1] Create `src/components/layout/Header.tsx` with logo, user menu, logout button
- [ ] T033 [US1] Create `src/components/layout/Sidebar.tsx` with navigation links
- [ ] T034 [US1] Create `src/components/layout/PageContainer.tsx` as main layout wrapper
- [ ] T035 [US1] Create `src/pages/DashboardPage.tsx` (empty state for now)
- [ ] T036 [US1] Setup React Router in `src/App.tsx` with public/protected routes
- [ ] T037 [US1] Create `src/components/auth/ProtectedRoute.tsx` for auth guard
- [ ] T038 [US1] Add loading states and error toasts using Shadcn Toast

**Checkpoint**: User can register, login, see empty dashboard, logout

---

## Phase 4: User Story 2 - Import faktur z Fakturownia.pl (Priority: P1) 🎯 MVP

**Goal**: Użytkownik może zaimportować faktury z pliku CSV

**Independent Test**: Upload CSV → podgląd → import → faktury na liście

### Tests for US2

- [ ] T039 [P] [US2] Unit test for Fakturownia parser in `tests/unit/parsers/fakturownia.test.ts`
- [ ] T040 [P] [US2] Integration test for import-invoices Edge Function in `tests/integration/edge-functions/import-invoices.test.ts`
- [ ] T041 [P] [US2] E2E test for invoice import flow in `tests/e2e/import-invoices.spec.ts`

### Implementation for US2

- [ ] T042 [US2] Create `src/lib/parsers/types.ts` with ParsedInvoice, ParseResult interfaces
- [ ] T043 [US2] Create `src/lib/parsers/fakturownia.ts` with CSV parser (client-side preview)
- [ ] T044 [US2] Create Edge Function `supabase/functions/import-invoices/index.ts` with server-side parsing and validation
- [ ] T045 [US2] Deploy Edge Function: `npx supabase functions deploy import-invoices`
- [ ] T046 [P] [US2] Add Shadcn components: Dialog, Table, Progress, Alert via `npx shadcn-ui@latest add`
- [ ] T047 [US2] Create `src/components/import/FileDropzone.tsx` with drag-drop, file validation
- [ ] T048 [US2] Create `src/components/import/ImportPreview.tsx` with data table preview (first 10 rows)
- [ ] T049 [US2] Create `src/components/import/ImportProgress.tsx` with progress bar, result summary
- [ ] T050 [US2] Create `src/components/import/ImportDialog.tsx` combining dropzone, preview, progress
- [ ] T051 [US2] Create `src/hooks/useImport.ts` with upload, preview, confirm logic
- [ ] T052 [US2] Create `src/hooks/useInvoices.ts` with list, filter, pagination
- [ ] T053 [US2] Create `src/components/invoices/InvoiceStatusBadge.tsx` with color-coded status
- [ ] T054 [US2] Create `src/components/invoices/InvoiceFilters.tsx` with status, date range filters
- [ ] T055 [US2] Create `src/components/invoices/InvoiceRow.tsx` with invoice data display
- [ ] T056 [US2] Create `src/components/invoices/InvoiceTable.tsx` with sorting, pagination
- [ ] T057 [US2] Create `src/pages/InvoicesPage.tsx` with import button, table, filters

**Checkpoint**: User can import invoices from Fakturownia CSV, see them in list

---

## Phase 5: User Story 3 - Import płatności bankowych (Priority: P1) 🎯 MVP

**Goal**: Użytkownik może zaimportować wyciąg bankowy (MT940, mBank CSV, ING CSV)

**Independent Test**: Upload wyciągu → podgląd → import → płatności na liście

### Tests for US3

- [ ] T058 [P] [US3] Unit test for MT940 parser in `tests/unit/parsers/mt940.test.ts`
- [ ] T059 [P] [US3] Unit test for mBank parser in `tests/unit/parsers/mbank.test.ts`
- [ ] T060 [P] [US3] Unit test for ING parser in `tests/unit/parsers/ing.test.ts`
- [ ] T061 [P] [US3] Integration test for import-payments Edge Function in `tests/integration/edge-functions/import-payments.test.ts`
- [ ] T062 [P] [US3] E2E test for payment import flow in `tests/e2e/import-payments.spec.ts`

### Implementation for US3

- [ ] T063 [US3] Create `src/lib/parsers/mt940.ts` with MT940 parser (client-side preview)
- [ ] T064 [US3] Create `src/lib/parsers/mbank.ts` with mBank CSV parser
- [ ] T065 [US3] Create `src/lib/parsers/ing.ts` with ING CSV parser
- [ ] T066 [US3] Create Edge Function `supabase/functions/import-payments/index.ts` with format auto-detection, parsing, validation
- [ ] T067 [US3] Deploy Edge Function: `npx supabase functions deploy import-payments`
- [ ] T068 [US3] Create `src/hooks/usePayments.ts` with list, filter, pagination
- [ ] T069 [US3] Create `src/components/payments/PaymentFilters.tsx` with date range, amount filters
- [ ] T070 [US3] Create `src/components/payments/PaymentRow.tsx` with payment data display
- [ ] T071 [US3] Create `src/components/payments/PaymentTable.tsx` with sorting, pagination
- [ ] T072 [US3] Create `src/pages/PaymentsPage.tsx` with import button, table, filters
- [ ] T073 [US3] Update `src/components/import/ImportDialog.tsx` to support payment import mode

**Checkpoint**: User can import payments from MT940/mBank/ING, see them in list

---

## Phase 6: User Story 4 - Automatyczne dopasowywanie (Priority: P1) 🎯 MVP

**Goal**: System automatycznie łączy faktury z płatnościami z confidence score

**Independent Test**: Faktury + płatności → auto-match → dopasowania z wynikami

### Tests for US4

- [ ] T074 [P] [US4] Unit test for confidence calculation in `tests/unit/matching/confidence.test.ts`
- [ ] T075 [P] [US4] Integration test for auto-match Edge Function in `tests/integration/edge-functions/auto-match.test.ts`
- [ ] T076 [P] [US4] E2E test for matching flow in `tests/e2e/matching.spec.ts`

### Implementation for US4

- [ ] T077 [US4] Create `src/lib/matching/types.ts` with MatchResult, MatchBreakdown interfaces
- [ ] T078 [US4] Create `src/lib/matching/confidence.ts` with matchAmount, matchInvoiceNumber, matchName, matchNip, matchDate functions
- [ ] T079 [US4] Create Edge Function `supabase/functions/auto-match/index.ts` with full matching algorithm
- [ ] T080 [US4] Deploy Edge Function: `npx supabase functions deploy auto-match`
- [ ] T081 [US4] Create `src/hooks/useMatches.ts` with list, create, delete match
- [ ] T082 [US4] Create `src/components/matching/MatchConfidence.tsx` with confidence score display (bar + percentage)
- [ ] T083 [US4] Create `src/components/matching/MatchSuggestion.tsx` with suggestion card, accept/reject buttons
- [ ] T084 [US4] Create `src/components/matching/MatchHistory.tsx` with match list, details
- [ ] T085 [US4] Create `src/pages/MatchingPage.tsx` with auto-match button, suggestions list, history

**Checkpoint**: User can run auto-match, see suggestions, accept/reject

---

## Phase 7: User Story 5 - Dashboard ze statusami (Priority: P2)

**Goal**: Użytkownik widzi podsumowanie finansów na dashboardzie

**Independent Test**: Dashboard pokazuje poprawne sumy i liczby

### Tests for US5

- [ ] T086 [P] [US5] E2E test for dashboard in `tests/e2e/dashboard.spec.ts`

### Implementation for US5

- [ ] T087 [US5] Create `src/hooks/useDashboard.ts` with summary data fetch from v_dashboard_summary
- [ ] T088 [US5] Create `src/components/dashboard/StatCard.tsx` with icon, count, amount, click handler
- [ ] T089 [US5] Create `src/components/dashboard/SummaryCards.tsx` with 3 cards: Opłacone, Oczekujące, Zaległe
- [ ] T090 [US5] Create `src/components/dashboard/EmptyState.tsx` with "Rozpocznij od importu faktur" message
- [ ] T091 [US5] Update `src/pages/DashboardPage.tsx` with summary cards, empty state, navigation

**Checkpoint**: Dashboard shows correct summaries, click navigates to filtered lists

---

## Phase 8: User Story 6 - Lista zaległości z kopiowaniem (Priority: P2)

**Goal**: Dedykowany widok zaległości z możliwością skopiowania do schowka

**Independent Test**: Lista zaległych faktur → kopiuj → dane w schowku

### Tests for US6

- [ ] T092 [P] [US6] E2E test for overdue list and copy in `tests/e2e/overdue.spec.ts`

### Implementation for US6

- [ ] T093 [US6] Create `src/components/overdue/OverdueRow.tsx` with buyer, NIP, amount, days overdue
- [ ] T094 [US6] Create `src/components/overdue/OverdueTable.tsx` with selection, sorting by days overdue
- [ ] T095 [US6] Create `src/components/overdue/CopyListButton.tsx` with clipboard API, format: "Nabywca | NIP | Kwota | Dni"
- [ ] T096 [US6] Create `src/pages/OverduePage.tsx` with table, copy button, empty state

**Checkpoint**: User can view overdue invoices and copy to clipboard

---

## Phase 9: User Story 7 - Ręczna korekta dopasowań (Priority: P3)

**Goal**: Użytkownik może ręcznie połączyć/rozłączyć fakturę z płatnością

**Independent Test**: Rozłącz auto-match → utwórz manual match

### Tests for US7

- [ ] T097 [P] [US7] E2E test for manual matching in `tests/e2e/matching.spec.ts` (extend)

### Implementation for US7

- [ ] T098 [US7] Create `src/components/matching/ManualMatchDialog.tsx` with payment selection list
- [ ] T099 [US7] Create `src/components/matching/UnmatchButton.tsx` with confirmation dialog
- [ ] T100 [US7] Update `src/components/invoices/InvoiceRow.tsx` with "Dopasuj ręcznie" action
- [ ] T101 [US7] Update `src/hooks/useMatches.ts` with createManualMatch, deleteMatch functions
- [ ] T102 [US7] Update `src/pages/MatchingPage.tsx` with manual match workflow

**Checkpoint**: User can manually match/unmatch invoices and payments

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Final improvements and quality checks

- [ ] T103 [P] Run Supabase advisor checks: security and performance via `mcp__supabase__get_advisors`
- [ ] T104 [P] Verify all RLS policies with manual testing (two users, data isolation)
- [ ] T105 [P] Performance testing: dashboard <2s, import <3s, matching <5s
- [ ] T106 Add keyboard navigation support (Tab order, Enter to confirm)
- [ ] T107 Verify responsive design on tablet viewport
- [ ] T108 Add error boundaries for graceful error handling
- [ ] T109 Configure Vercel deployment in `vercel.json`
- [ ] T110 Final E2E test run: all specs passing

**Checkpoint**: Application ready for production deployment

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup) ──────────────────────────────────────┐
                                                       │
Phase 2 (Database & Types) ───────────────────────────┤
                                                       │
         ┌─────────────────────────────────────────────┘
         │
         ▼
Phase 3 (US1: Auth) ─────────────────────────────────┐
         │                                            │
         ▼                                            │
Phase 4 (US2: Import Invoices) ──────────────────────┤
         │                                            │
         ▼                                            │
Phase 5 (US3: Import Payments) ──────────────────────┤
         │                                            │
         ▼                                            │
Phase 6 (US4: Matching) ─────────────────────────────┤
         │                                            │
         ├──────────────────────────────┐            │
         ▼                              ▼            │
Phase 7 (US5: Dashboard)    Phase 8 (US6: Overdue)  │
         │                              │            │
         └──────────────┬───────────────┘            │
                        ▼                            │
              Phase 9 (US7: Manual Match)            │
                        │                            │
                        ▼                            │
              Phase 10 (Polish) ◄────────────────────┘
```

### User Story Dependencies

| Story | Depends On | Can Start After |
|-------|------------|-----------------|
| US1 (Auth) | Phase 2 | Database ready |
| US2 (Import Invoices) | US1 | User can login |
| US3 (Import Payments) | US1 | User can login |
| US4 (Matching) | US2, US3 | Both imports working |
| US5 (Dashboard) | US2 | Invoices exist |
| US6 (Overdue) | US2 | Invoices exist |
| US7 (Manual Match) | US4 | Auto-matching exists |

### Parallel Opportunities

**Within Phase 1 (Setup):**
- T002, T003, T004, T005, T006, T009 can run in parallel

**Within Phase 2 (Database):**
- T019, T020, T021, T022 (types) can run in parallel after T018

**Within each User Story:**
- All tests marked [P] can run in parallel
- All unit tests can run in parallel

**Cross-Story Parallelism:**
- US5 (Dashboard) and US6 (Overdue) can be developed in parallel after US2

---

## Task Count Summary

| Phase | Tasks | Story |
|-------|-------|-------|
| Phase 1: Setup | 9 | - |
| Phase 2: Database | 15 | - |
| Phase 3: Auth | 14 | US1 |
| Phase 4: Import Invoices | 19 | US2 |
| Phase 5: Import Payments | 16 | US3 |
| Phase 6: Matching | 12 | US4 |
| Phase 7: Dashboard | 5 | US5 |
| Phase 8: Overdue | 5 | US6 |
| Phase 9: Manual Match | 6 | US7 |
| Phase 10: Polish | 8 | - |
| **Total** | **109** | |

---

## Implementation Strategy

### MVP First (Recommended)

1. **Phase 1-2**: Setup + Database (foundation)
2. **Phase 3**: Auth (US1) - can demo login/register
3. **Phase 4**: Import Invoices (US2) - can demo invoice import
4. **Phase 5**: Import Payments (US3) - can demo payment import
5. **Phase 6**: Matching (US4) - **MVP Complete!** Can demo full flow
6. **Phase 7-9**: Dashboard, Overdue, Manual Match (enhancements)
7. **Phase 10**: Polish and deploy

### Incremental Delivery Milestones

| Milestone | Phases | Deliverable |
|-----------|--------|-------------|
| M1: Foundation | 1-2 | Project setup, database ready |
| M2: Auth Ready | 3 | Users can register and login |
| M3: Data Import | 4-5 | Users can import invoices and payments |
| M4: MVP Complete | 6 | Auto-matching works end-to-end |
| M5: Full Feature | 7-9 | All user stories implemented |
| M6: Production | 10 | Deployed and tested |

---

## Notes

- [P] tasks = different files, no dependencies, can run in parallel
- [US#] label maps task to specific user story for traceability
- Tests MUST be written first and FAIL before implementation (constitution requirement)
- Commit after each task or logical group
- Run `npm run lint` and `npm run typecheck` before each commit
- Stop at any checkpoint to validate story independently
