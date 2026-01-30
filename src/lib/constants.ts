// File size limits
export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

// Matching algorithm thresholds
export const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.85, // Auto-match threshold
  MEDIUM: 0.35, // Suggestion threshold (increased to reduce noise)
  LOW: 0.0, // No match
} as const

// Resource limits to prevent browser crashes
export const RESOURCE_LIMITS = {
  MAX_INPUT_INVOICES: 2500,
  MAX_INPUT_PAYMENTS: 2500,
  MAX_TOTAL_RECORDS: 5000,
  MAX_COMPARISONS: 400000,
  MAX_SUGGESTIONS: 500,
  MAX_GROUP_SUGGESTIONS: 100,
  SUGGESTIONS_PER_PAGE: 50,
  WARNING_THRESHOLD: 200,
} as const

// Matching weights
// Note: When subaccount matches (1.0), it provides 100% confidence regardless of other factors
export const MATCHING_WEIGHTS = {
  SUBACCOUNT: 1.0, // Subaccount match gives instant 100% confidence
  AMOUNT: 0.30,
  INVOICE_NUMBER: 0.35, // Increased - invoice number in title is reliable
  NAME: 0.15,
  NIP: 0.1,
  DATE: 0.1,
} as const

// Re-export types from database for backward compatibility
export type { PaymentStatus, MatchType, ImportSource } from '@/types/database'

// Status colors (matching constitution)
export const STATUS_COLORS = {
  paid: 'text-green-600 bg-green-100',
  pending: 'text-yellow-600 bg-yellow-100',
  overdue: 'text-red-600 bg-red-100',
  partial: 'text-blue-600 bg-blue-100',
} as const

// Pagination
export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100
