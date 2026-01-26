import type { MatchType, Invoice, Payment } from './database'

// Match with full invoice and payment details
export interface MatchWithDetails {
  id: string
  user_id: string
  invoice_id: string
  payment_id: string
  confidence_score: number
  match_type: MatchType
  matched_at: string
  matched_by: string | null
  invoice: Invoice
  payment: Payment
}

// Result from matching algorithm
export interface MatchResult {
  invoiceId: string
  paymentId: string
  confidence: number
  breakdown: MatchBreakdown
  reasons: string[]
}

export interface MatchBreakdown {
  amount: number // 0-1 score for amount match
  invoiceNumber: number // 0-1 score for invoice number in title
  name: number // 0-1 score for name similarity
  nip: number // 0-1 score for NIP match
  date: number // 0-1 score for date proximity
  subaccount: number // 0-1 score for subaccount match (highest priority)
}

export interface MatchSuggestion {
  invoice: Invoice
  payment: Payment
  confidence: number
  breakdown: MatchBreakdown
  reasons: string[]
}

// Auto-match response from Edge Function
export interface AutoMatchResponse {
  success: boolean
  autoMatched: MatchResult[]
  suggestions: MatchResult[]
  unmatched: {
    invoices: string[]
    payments: string[]
  }
}
