import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { findMatches, calculateMatchConfidence } from '@/lib/matching'
import type { Invoice, Payment, Match } from '@/types'
import type { MatchResult, MatchSuggestion } from '@/types'

interface UseMatchingResult {
  // State
  isLoading: boolean
  isProcessing: boolean
  autoMatches: MatchResult[]
  suggestions: MatchSuggestion[]
  confirmedMatches: Match[]
  unmatchedInvoices: Invoice[]
  unmatchedPayments: Payment[]

  // Actions
  runAutoMatch: () => Promise<void>
  confirmMatch: (invoiceId: string, paymentId: string) => Promise<void>
  rejectSuggestion: (invoiceId: string, paymentId: string) => void
  createManualMatch: (invoiceId: string, paymentId: string) => Promise<void>
  removeMatch: (matchId: string) => Promise<void>
  refresh: () => Promise<void>
}

export function useMatching(): UseMatchingResult {
  const [isLoading, setIsLoading] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [autoMatches, setAutoMatches] = useState<MatchResult[]>([])
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([])
  const [confirmedMatches, setConfirmedMatches] = useState<Match[]>([])
  const [unmatchedInvoices, setUnmatchedInvoices] = useState<Invoice[]>([])
  const [unmatchedPayments, setUnmatchedPayments] = useState<Payment[]>([])

  // Cache for invoice and payment data
  const [invoicesCache, setInvoicesCache] = useState<Map<string, Invoice>>(new Map())
  const [paymentsCache, setPaymentsCache] = useState<Map<string, Payment>>(new Map())

  const refresh = useCallback(async () => {
    setIsLoading(true)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        toast.error('Sesja wygasła')
        return
      }

      // Fetch all data in parallel
      const [invoicesResult, paymentsResult, matchesResult] = await Promise.all([
        supabase
          .from('invoices')
          .select('*')
          .eq('user_id', user.id)
          .order('due_date', { ascending: true }),
        supabase
          .from('payments')
          .select('*')
          .eq('user_id', user.id)
          .order('transaction_date', { ascending: false }),
        supabase
          .from('matches')
          .select('*')
          .eq('user_id', user.id)
          .order('matched_at', { ascending: false }),
      ])

      if (invoicesResult.error) throw invoicesResult.error
      if (paymentsResult.error) throw paymentsResult.error
      if (matchesResult.error) throw matchesResult.error

      const invoices = invoicesResult.data || []
      const payments = paymentsResult.data || []
      const matches = matchesResult.data || []

      // Update caches
      const invCache = new Map<string, Invoice>()
      invoices.forEach((inv) => invCache.set(inv.id, inv))
      setInvoicesCache(invCache)

      const payCache = new Map<string, Payment>()
      payments.forEach((pay) => payCache.set(pay.id, pay))
      setPaymentsCache(payCache)

      // Set confirmed matches
      setConfirmedMatches(matches)

      // Get IDs of already matched invoices and payments
      const matchedInvoiceIds = new Set(matches.map((m) => m.invoice_id))
      const matchedPaymentIds = new Set(matches.map((m) => m.payment_id))

      // Filter to unmatched items
      const unmatched = {
        invoices: invoices.filter(
          (inv) => inv.payment_status === 'pending' && !matchedInvoiceIds.has(inv.id)
        ),
        payments: payments.filter((pay) => !matchedPaymentIds.has(pay.id)),
      }

      setUnmatchedInvoices(unmatched.invoices)
      setUnmatchedPayments(unmatched.payments)

      // Clear previous auto matches and suggestions
      setAutoMatches([])
      setSuggestions([])
    } catch (error) {
      console.error('Error refreshing data:', error)
      toast.error('Błąd podczas pobierania danych')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const runAutoMatch = useCallback(async () => {
    setIsProcessing(true)

    try {
      // Find matches using the algorithm
      const result = findMatches(unmatchedInvoices, unmatchedPayments)

      setAutoMatches(result.autoMatches)

      // Create suggestions with full invoice/payment data
      const suggestionsList: MatchSuggestion[] = result.suggestions
        .map((match) => {
          const invoice = invoicesCache.get(match.invoiceId)
          const payment = paymentsCache.get(match.paymentId)

          if (!invoice || !payment) return null

          return {
            invoice,
            payment,
            confidence: match.confidence,
            breakdown: match.breakdown,
            reasons: match.reasons,
          }
        })
        .filter((s): s is MatchSuggestion => s !== null)

      setSuggestions(suggestionsList)

      const totalFound = result.autoMatches.length + result.suggestions.length
      if (totalFound > 0) {
        toast.success(
          `Znaleziono ${result.autoMatches.length} pewnych i ${result.suggestions.length} potencjalnych dopasowań`
        )
      } else {
        toast.info('Nie znaleziono nowych dopasowań')
      }
    } catch (error) {
      console.error('Error running auto-match:', error)
      toast.error('Błąd podczas automatycznego dopasowywania')
    } finally {
      setIsProcessing(false)
    }
  }, [unmatchedInvoices, unmatchedPayments, invoicesCache, paymentsCache])

  const confirmMatch = useCallback(
    async (invoiceId: string, paymentId: string) => {
      setIsProcessing(true)

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          toast.error('Sesja wygasła')
          return
        }

        const invoice = invoicesCache.get(invoiceId)
        const payment = paymentsCache.get(paymentId)

        if (!invoice || !payment) {
          toast.error('Nie znaleziono faktury lub płatności')
          return
        }

        // Calculate confidence for this specific match
        const matchResult = calculateMatchConfidence(invoice, payment)

        // Create match record
        const { error: matchError } = await supabase.from('matches').insert({
          user_id: user.id,
          invoice_id: invoiceId,
          payment_id: paymentId,
          confidence_score: matchResult.confidence,
          match_type: 'auto',
          matched_by: user.id,
        })

        if (matchError) throw matchError

        // Update invoice status to paid
        const { error: invoiceError } = await supabase
          .from('invoices')
          .update({ payment_status: 'paid' })
          .eq('id', invoiceId)

        if (invoiceError) throw invoiceError

        toast.success('Dopasowanie potwierdzone')

        // Refresh data
        await refresh()
      } catch (error) {
        console.error('Error confirming match:', error)
        toast.error('Błąd podczas potwierdzania dopasowania')
      } finally {
        setIsProcessing(false)
      }
    },
    [invoicesCache, paymentsCache, refresh]
  )

  const rejectSuggestion = useCallback(
    (invoiceId: string, paymentId: string) => {
      // Remove from suggestions list
      setSuggestions((prev) =>
        prev.filter(
          (s) => !(s.invoice.id === invoiceId && s.payment.id === paymentId)
        )
      )

      // Also remove from auto matches if present
      setAutoMatches((prev) =>
        prev.filter(
          (m) => !(m.invoiceId === invoiceId && m.paymentId === paymentId)
        )
      )

      toast.info('Sugestia odrzucona')
    },
    []
  )

  const createManualMatch = useCallback(
    async (invoiceId: string, paymentId: string) => {
      setIsProcessing(true)

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          toast.error('Sesja wygasła')
          return
        }

        const invoice = invoicesCache.get(invoiceId)
        const payment = paymentsCache.get(paymentId)

        if (!invoice || !payment) {
          toast.error('Nie znaleziono faktury lub płatności')
          return
        }

        // Calculate confidence
        const matchResult = calculateMatchConfidence(invoice, payment)

        // Create match record
        const { error: matchError } = await supabase.from('matches').insert({
          user_id: user.id,
          invoice_id: invoiceId,
          payment_id: paymentId,
          confidence_score: matchResult.confidence,
          match_type: 'manual',
          matched_by: user.id,
        })

        if (matchError) throw matchError

        // Update invoice status to paid
        const { error: invoiceError } = await supabase
          .from('invoices')
          .update({ payment_status: 'paid' })
          .eq('id', invoiceId)

        if (invoiceError) throw invoiceError

        toast.success('Ręczne dopasowanie utworzone')

        // Refresh data
        await refresh()
      } catch (error) {
        console.error('Error creating manual match:', error)
        toast.error('Błąd podczas tworzenia dopasowania')
      } finally {
        setIsProcessing(false)
      }
    },
    [invoicesCache, paymentsCache, refresh]
  )

  const removeMatch = useCallback(
    async (matchId: string) => {
      setIsProcessing(true)

      try {
        // Get the match to find the invoice
        const match = confirmedMatches.find((m) => m.id === matchId)
        if (!match) {
          toast.error('Nie znaleziono dopasowania')
          return
        }

        // Delete the match
        const { error: deleteError } = await supabase
          .from('matches')
          .delete()
          .eq('id', matchId)

        if (deleteError) throw deleteError

        // Update invoice status back to pending
        const { error: invoiceError } = await supabase
          .from('invoices')
          .update({ payment_status: 'pending' })
          .eq('id', match.invoice_id)

        if (invoiceError) throw invoiceError

        toast.success('Dopasowanie usunięte')

        // Refresh data
        await refresh()
      } catch (error) {
        console.error('Error removing match:', error)
        toast.error('Błąd podczas usuwania dopasowania')
      } finally {
        setIsProcessing(false)
      }
    },
    [confirmedMatches, refresh]
  )

  return {
    isLoading,
    isProcessing,
    autoMatches,
    suggestions,
    confirmedMatches,
    unmatchedInvoices,
    unmatchedPayments,
    runAutoMatch,
    confirmMatch,
    rejectSuggestion,
    createManualMatch,
    removeMatch,
    refresh,
  }
}
