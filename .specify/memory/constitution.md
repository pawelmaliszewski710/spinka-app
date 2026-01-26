<!--
  Sync Impact Report
  ==================
  Version change: 0.0.0 → 1.0.0
  Modified principles: N/A (initial constitution)
  Added sections:
    - Core Principles (5 principles)
    - Performance Standards
    - Development Workflow
    - Governance
  Removed sections: N/A
  Templates requiring updates:
    - plan-template.md ✅ (Constitution Check section compatible)
    - spec-template.md ✅ (Success Criteria aligns with Performance Principle)
    - tasks-template.md ✅ (Testing phases align with Test-First principle)
  Follow-up TODOs: None
-->

# InvoiceMatch Constitution

## Core Principles

### I. Code Quality First

All code MUST be clean, readable, and maintainable. This is non-negotiable for a financial application handling sensitive invoice and payment data.

**Rules:**
- TypeScript strict mode MUST be enabled; `any` type is forbidden except in edge cases with explicit justification
- All functions MUST have explicit return types
- Component props MUST use interfaces, not inline types
- Magic numbers and strings MUST be extracted to named constants
- Code MUST follow the project naming conventions: camelCase for variables/functions, PascalCase for components, snake_case for database
- Dead code MUST be removed immediately, not commented out
- Maximum function length: 50 lines; maximum file length: 300 lines (excluding imports/types)

**Rationale:** Financial applications require high code quality to prevent bugs that could cause incorrect matching, lost payments, or data corruption. Strict typing catches errors at compile time rather than in production.

### II. Test-First Development

Every feature MUST have corresponding tests written BEFORE implementation. Tests define the contract and expected behavior.

**Rules:**
- E2E tests (Playwright) are REQUIRED for all user-facing flows: import, matching, dashboard views
- Integration tests are REQUIRED for: Supabase Edge Functions, parsing algorithms, matching logic
- Unit tests are REQUIRED for: utility functions, parsers, data transformers
- Test coverage MUST be maintained above 80% for critical paths (parsers, matching algorithm)
- Tests MUST run in CI before merge; failing tests block deployment
- Test data MUST use realistic but anonymized invoice/payment samples

**Rationale:** Invoice matching is deterministic—given the same inputs, results must be identical. Tests ensure algorithm correctness and prevent regressions when adding new bank formats or matching rules.

### III. User Experience Consistency

The UI MUST be consistent, intuitive, and optimized for the financial workflow. Users deal with large datasets and need efficiency.

**Rules:**
- All UI components MUST use Shadcn/ui as the base; custom styling MUST extend, not replace
- Loading states are REQUIRED for all async operations (imports, matches, data fetches)
- Error messages MUST be user-friendly and actionable, never exposing technical details
- Tables MUST support: sorting, filtering, pagination for datasets >50 rows
- Critical actions (delete, unmatch) MUST require confirmation dialogs
- Keyboard navigation MUST be supported for power users (tab order, Enter to confirm)
- One-click copy MUST be available for invoice numbers, amounts, and debtor lists
- Color coding MUST be consistent: red=overdue, green=paid, yellow=pending, blue=partial

**Rationale:** Users process hundreds of invoices and payments. Consistent UX reduces cognitive load and errors. Power users need keyboard shortcuts and bulk operations.

### IV. Performance Standards

The application MUST remain responsive with realistic data volumes typical for SMB invoicing.

**Rules:**
- Dashboard initial load MUST complete in <2 seconds with 1000 invoices
- File parsing (CSV/MT940) MUST process 1000 records in <3 seconds client-side
- Matching algorithm MUST complete for 500 invoices × 500 payments in <5 seconds
- Supabase queries MUST use appropriate indexes; full table scans are forbidden
- React components MUST avoid unnecessary re-renders; use React.memo for list items
- File uploads MUST show progress and support files up to 10MB
- API responses MUST be paginated; maximum 100 records per request

**Rationale:** Users import monthly bank statements with hundreds of transactions. The system must handle this volume without lag or timeouts.

### V. Data Security & Privacy

Invoice and payment data is sensitive financial information. Security is paramount.

**Rules:**
- All database access MUST go through Row Level Security (RLS) policies
- User data MUST be isolated; no cross-tenant data leaks are acceptable
- Credentials, API keys, NIP numbers MUST never be logged or exposed in error messages
- File uploads MUST be validated for format and size before processing
- Session tokens MUST expire after 24 hours of inactivity
- All Supabase Edge Functions MUST validate authentication before processing
- Input validation MUST occur on both client and server side

**Rationale:** Financial data breaches have severe legal and reputational consequences. Defense in depth prevents unauthorized access.

## Performance Standards

### Benchmarks

| Operation | Target | Maximum |
|-----------|--------|---------|
| Dashboard load (1000 invoices) | <1.5s | 2s |
| CSV import (1000 rows) | <2s | 3s |
| MT940 parse (1000 transactions) | <2s | 3s |
| Auto-match (500×500) | <3s | 5s |
| Individual match lookup | <100ms | 200ms |
| Filter/sort operations | <200ms | 500ms |

### Monitoring

- Performance regressions MUST be caught in CI via benchmark tests
- Lighthouse score MUST remain above 80 for Performance
- Database query performance MUST be monitored; queries >500ms require optimization

## Development Workflow

### Code Review Requirements

- All changes MUST be reviewed before merge
- Reviews MUST verify: type safety, test coverage, RLS compliance, UI consistency
- Security-sensitive changes (auth, RLS, data access) REQUIRE explicit security review

### Quality Gates

1. **Pre-commit**: TypeScript compilation, ESLint, Prettier formatting
2. **CI Pipeline**: Unit tests, integration tests, type checking
3. **Pre-merge**: E2E tests, security scan, performance benchmarks
4. **Post-deploy**: Smoke tests on staging, Supabase advisor checks

### Definition of Done

A feature is complete when:
- [ ] All acceptance criteria from spec are met
- [ ] Tests pass (unit, integration, E2E as applicable)
- [ ] No TypeScript errors or ESLint warnings
- [ ] RLS policies verified for new/modified tables
- [ ] Documentation updated (if API or schema changes)
- [ ] Performance within defined benchmarks

## Governance

### Amendment Process

1. Propose change via documented rationale
2. Review impact on existing code and tests
3. Update constitution with version increment
4. Update dependent templates if affected
5. Communicate changes to team

### Versioning Policy

- **MAJOR**: Principle removal or fundamental change (e.g., removing Test-First requirement)
- **MINOR**: New principle added or existing principle materially expanded
- **PATCH**: Clarifications, threshold adjustments, wording improvements

### Compliance Review

- Constitution compliance MUST be verified during code review
- Violations MUST be documented with justification in Complexity Tracking section
- Quarterly review of constitution relevance and threshold appropriateness

**Version**: 1.0.0 | **Ratified**: 2026-01-26 | **Last Amended**: 2026-01-26
