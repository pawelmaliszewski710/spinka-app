import type { Invoice, Payment } from '@/types'
import type { MatchResult, MatchBreakdown } from '@/types'
import { MATCHING_WEIGHTS, CONFIDENCE_THRESHOLDS } from '@/lib/constants'
import {
  extractInvoiceNumbers,
  extractNIP,
  normalizeNIP,
  compareCompanyNames,
  normalizeString,
} from './string-utils'

/**
 * Calculate amount match score
 * Exact match = 1.0, within 1% = 0.9, within 5% = 0.7
 */
function calculateAmountScore(invoiceAmount: number, paymentAmount: number): number {
  if (invoiceAmount === paymentAmount) return 1.0

  const diff = Math.abs(invoiceAmount - paymentAmount)
  const percentDiff = diff / invoiceAmount

  if (percentDiff <= 0.001) return 0.99 // Within 0.1% (rounding errors)
  if (percentDiff <= 0.01) return 0.9 // Within 1%
  if (percentDiff <= 0.05) return 0.7 // Within 5%
  if (percentDiff <= 0.1) return 0.5 // Within 10%

  return 0
}

/**
 * Calculate invoice number match score
 * Check if any invoice number pattern is found in payment title
 */
function calculateInvoiceNumberScore(
  invoiceNumber: string,
  paymentTitle: string
): number {
  const normalizedInvoiceNumber = normalizeString(invoiceNumber)
  const normalizedTitle = normalizeString(paymentTitle)

  // Direct match (normalized)
  if (normalizedTitle.includes(normalizedInvoiceNumber)) {
    return 1.0
  }

  // Extract numbers from invoice number for partial matching
  const invoiceDigits = invoiceNumber.replace(/\D/g, '')
  const extractedNumbers = extractInvoiceNumbers(paymentTitle)

  for (const extracted of extractedNumbers) {
    const extractedDigits = extracted.replace(/\D/g, '')

    // Check if digits match
    if (extractedDigits === invoiceDigits) {
      return 0.95
    }

    // Check if invoice number is contained
    if (normalizeString(extracted).includes(normalizedInvoiceNumber)) {
      return 0.9
    }
  }

  // Check for partial number match (last 4-6 digits)
  if (invoiceDigits.length >= 4) {
    const lastDigits = invoiceDigits.slice(-4)
    if (normalizedTitle.includes(lastDigits)) {
      return 0.6
    }
  }

  return 0
}

/**
 * Calculate name match score using fuzzy matching
 */
function calculateNameScore(buyerName: string, senderName: string): number {
  return compareCompanyNames(buyerName, senderName)
}

/**
 * Calculate NIP match score
 */
function calculateNIPScore(
  buyerNip: string | null,
  paymentTitle: string
): number {
  if (!buyerNip) return 0

  const normalizedBuyerNip = normalizeNIP(buyerNip)
  if (!normalizedBuyerNip) return 0

  const extractedNip = extractNIP(paymentTitle)

  if (extractedNip === normalizedBuyerNip) {
    return 1.0
  }

  // Check if NIP digits appear in title (partial match)
  if (paymentTitle.includes(normalizedBuyerNip)) {
    return 0.9
  }

  return 0
}

/**
 * Calculate date proximity score
 * Payment should ideally be around due date
 */
function calculateDateScore(dueDate: string, paymentDate: string): number {
  const due = new Date(dueDate)
  const payment = new Date(paymentDate)

  const daysDiff = Math.abs(
    (payment.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)
  )

  if (daysDiff <= 3) return 1.0 // Within 3 days of due date
  if (daysDiff <= 7) return 0.9 // Within a week
  if (daysDiff <= 14) return 0.8 // Within 2 weeks
  if (daysDiff <= 30) return 0.6 // Within a month
  if (daysDiff <= 60) return 0.4 // Within 2 months
  if (daysDiff <= 90) return 0.2 // Within 3 months

  return 0.1 // More than 3 months
}

/**
 * Calculate overall match confidence between an invoice and payment
 */
export function calculateMatchConfidence(
  invoice: Invoice,
  payment: Payment
): MatchResult {
  // Calculate individual scores
  const amountScore = calculateAmountScore(invoice.gross_amount, payment.amount)
  const invoiceNumberScore = calculateInvoiceNumberScore(
    invoice.invoice_number,
    payment.title
  )
  const nameScore = calculateNameScore(invoice.buyer_name, payment.sender_name)
  const nipScore = calculateNIPScore(invoice.buyer_nip, payment.title)
  const dateScore = calculateDateScore(invoice.due_date, payment.transaction_date)

  const breakdown: MatchBreakdown = {
    amount: amountScore,
    invoiceNumber: invoiceNumberScore,
    name: nameScore,
    nip: nipScore,
    date: dateScore,
  }

  // Calculate weighted confidence
  const confidence =
    amountScore * MATCHING_WEIGHTS.AMOUNT +
    invoiceNumberScore * MATCHING_WEIGHTS.INVOICE_NUMBER +
    nameScore * MATCHING_WEIGHTS.NAME +
    nipScore * MATCHING_WEIGHTS.NIP +
    dateScore * MATCHING_WEIGHTS.DATE

  // Generate human-readable reasons
  const reasons: string[] = []

  if (amountScore >= 0.9) {
    reasons.push(`Kwota zgodna: ${payment.amount.toFixed(2)} PLN`)
  } else if (amountScore >= 0.5) {
    reasons.push(`Kwota zbliżona: ${payment.amount.toFixed(2)} vs ${invoice.gross_amount.toFixed(2)} PLN`)
  }

  if (invoiceNumberScore >= 0.9) {
    reasons.push(`Numer faktury znaleziony w tytule`)
  } else if (invoiceNumberScore >= 0.6) {
    reasons.push(`Częściowe dopasowanie numeru faktury`)
  }

  if (nameScore >= 0.8) {
    reasons.push(`Nazwa nadawcy zgodna z nabywcą`)
  } else if (nameScore >= 0.5) {
    reasons.push(`Podobna nazwa nadawcy`)
  }

  if (nipScore >= 0.9) {
    reasons.push(`NIP znaleziony w tytule przelewu`)
  }

  if (dateScore >= 0.8) {
    reasons.push(`Płatność blisko terminu`)
  }

  return {
    invoiceId: invoice.id,
    paymentId: payment.id,
    confidence: Math.round(confidence * 100) / 100,
    breakdown,
    reasons,
  }
}

/**
 * Find all potential matches for invoices and payments
 */
export function findMatches(
  invoices: Invoice[],
  payments: Payment[]
): {
  autoMatches: MatchResult[]
  suggestions: MatchResult[]
  unmatchedInvoices: string[]
  unmatchedPayments: string[]
} {
  const autoMatches: MatchResult[] = []
  const suggestions: MatchResult[] = []
  const matchedInvoiceIds = new Set<string>()
  const matchedPaymentIds = new Set<string>()

  // Only consider pending invoices
  const pendingInvoices = invoices.filter((inv) => inv.payment_status === 'pending')

  // Calculate all potential matches
  const allMatches: MatchResult[] = []

  for (const invoice of pendingInvoices) {
    for (const payment of payments) {
      // Skip if currencies don't match
      if (invoice.currency !== payment.currency) continue

      const result = calculateMatchConfidence(invoice, payment)

      // Only consider matches with some confidence
      if (result.confidence >= CONFIDENCE_THRESHOLDS.MEDIUM) {
        allMatches.push(result)
      }
    }
  }

  // Sort by confidence (highest first)
  allMatches.sort((a, b) => b.confidence - a.confidence)

  // Process matches - each invoice and payment can only be matched once
  for (const match of allMatches) {
    if (matchedInvoiceIds.has(match.invoiceId) || matchedPaymentIds.has(match.paymentId)) {
      continue
    }

    if (match.confidence >= CONFIDENCE_THRESHOLDS.HIGH) {
      autoMatches.push(match)
      matchedInvoiceIds.add(match.invoiceId)
      matchedPaymentIds.add(match.paymentId)
    } else if (match.confidence >= CONFIDENCE_THRESHOLDS.MEDIUM) {
      suggestions.push(match)
      // Don't mark as matched yet - these are just suggestions
    }
  }

  // Find unmatched invoices and payments
  const unmatchedInvoices = pendingInvoices
    .filter((inv) => !matchedInvoiceIds.has(inv.id))
    .map((inv) => inv.id)

  const unmatchedPayments = payments
    .filter((pay) => !matchedPaymentIds.has(pay.id))
    .map((pay) => pay.id)

  return {
    autoMatches,
    suggestions,
    unmatchedInvoices,
    unmatchedPayments,
  }
}

/**
 * Get match quality label based on confidence
 */
export function getMatchQuality(confidence: number): {
  label: string
  color: string
} {
  if (confidence >= CONFIDENCE_THRESHOLDS.HIGH) {
    return { label: 'Wysoka zgodność', color: 'text-green-600' }
  }
  if (confidence >= 0.75) {
    return { label: 'Dobra zgodność', color: 'text-blue-600' }
  }
  if (confidence >= CONFIDENCE_THRESHOLDS.MEDIUM) {
    return { label: 'Średnia zgodność', color: 'text-yellow-600' }
  }
  return { label: 'Niska zgodność', color: 'text-red-600' }
}
