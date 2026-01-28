// Re-export types from database (Supabase types)
export type {
  Database,
  Company,
  CompanyInsert,
  CompanyUpdate,
  CompanyIntegration,
  CompanyIntegrationInsert,
  CompanyIntegrationUpdate,
  Invoice,
  InvoiceInsert,
  InvoiceUpdate,
  Payment,
  PaymentInsert,
  PaymentUpdate,
  Match,
  MatchInsert,
  MatchUpdate,
  DashboardSummary,
  OverdueInvoice,
  PaymentStatus,
  MatchType,
  ImportSource,
  AiProvider,
} from './database'

// Invoice filter types
export type { InvoiceFilters } from './invoice'

// Payment filter types
export type { PaymentFilters } from './payment'

// Match types (additional types for matching algorithm)
export type {
  MatchWithDetails,
  MatchResult,
  MatchBreakdown,
  MatchSuggestion,
  GroupMatchSuggestion,
  AutoMatchResponse,
} from './match'

// Import types
export type {
  ParsedInvoice,
  ParsedPayment,
  ImportError,
  ParseResult,
  ImportInvoicesResponse,
  ImportPaymentsResponse,
  FileValidation,
  ImportState,
} from './import'
