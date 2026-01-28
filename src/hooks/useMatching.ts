import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useCompany } from '@/contexts/CompanyContext'
import { findMatchesExtended, calculateMatchConfidence } from '@/lib/matching'
import type { Invoice, Payment, Match, MatchResult, MatchSuggestion, GroupMatchSuggestion } from '@/types'

export interface MatchingProgress {
  current: number
  total: number
  phase: 'analyzing' | 'saving' | 'complete'
  message: string
}

interface UseMatchingResult {
  // State
  isLoading: boolean
  isProcessing: boolean
  progress: MatchingProgress | null
  autoMatches: MatchResult[]
  suggestions: MatchSuggestion[]
  groupSuggestions: GroupMatchSuggestion[]
  confirmedMatches: Match[]
  unmatchedInvoices: Invoice[]
  unmatchedPayments: Payment[]
  invoicesCache: Map<string, Invoice>
  paymentsCache: Map<string, Payment>

  // Actions
  runAutoMatch: () => Promise<void>
  confirmMatch: (invoiceId: string, paymentId: string) => Promise<void>
  confirmGroupMatch: (suggestion: GroupMatchSuggestion) => Promise<void>
  rejectSuggestion: (invoiceId: string, paymentId: string) => void
  rejectGroupSuggestion: (paymentId: string) => void
  createManualMatch: (invoiceId: string, paymentId: string) => Promise<void>
  removeMatch: (matchId: string) => Promise<void>
  deleteInvoice: (invoiceId: string) => Promise<void>
  deletePayment: (paymentId: string) => Promise<void>
  updateInvoicePaymentStatus: (invoiceId: string, status: 'pending' | 'paid' | 'overdue' | 'partial' | 'canceled') => Promise<boolean>
  updateInvoiceFakturowniaStatus: (invoiceId: string, status: 'issued' | 'paid') => Promise<boolean>
  refresh: () => Promise<void>
}

export function useMatching(): UseMatchingResult {
  const { currentCompany } = useCompany()
  const [isLoading, setIsLoading] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState<MatchingProgress | null>(null)
  const [autoMatches, setAutoMatches] = useState<MatchResult[]>([])
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([])
  const [groupSuggestions, setGroupSuggestions] = useState<GroupMatchSuggestion[]>([])
  const [confirmedMatches, setConfirmedMatches] = useState<Match[]>([])
  const [unmatchedInvoices, setUnmatchedInvoices] = useState<Invoice[]>([])
  const [unmatchedPayments, setUnmatchedPayments] = useState<Payment[]>([])

  // Cache for invoice and payment data
  const [invoicesCache, setInvoicesCache] = useState<Map<string, Invoice>>(new Map())
  const [paymentsCache, setPaymentsCache] = useState<Map<string, Payment>>(new Map())

  const refresh = useCallback(async () => {
    if (!currentCompany) {
      setConfirmedMatches([])
      setUnmatchedInvoices([])
      setUnmatchedPayments([])
      setInvoicesCache(new Map())
      setPaymentsCache(new Map())
      setIsLoading(false)
      return
    }

    setIsLoading(true)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        toast.error('Sesja wygasła')
        return
      }

      // Fetch all data in parallel - filter by company_id
      const [invoicesResult, paymentsResult, matchesResult] = await Promise.all([
        supabase
          .from('invoices')
          .select('*')
          .eq('company_id', currentCompany.id)
          .order('due_date', { ascending: true }),
        supabase
          .from('payments')
          .select('*')
          .eq('company_id', currentCompany.id)
          .order('transaction_date', { ascending: false }),
        supabase
          .from('matches')
          .select('*')
          .eq('company_id', currentCompany.id)
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
      // Include pending, overdue, and partial statuses (all need payment matching)
      const matchableStatuses = ['pending', 'overdue', 'partial']
      const unmatched = {
        invoices: invoices.filter(
          (inv) => matchableStatuses.includes(inv.payment_status) && !matchedInvoiceIds.has(inv.id)
        ),
        payments: payments.filter((pay) => !matchedPaymentIds.has(pay.id)),
      }

      setUnmatchedInvoices(unmatched.invoices)
      setUnmatchedPayments(unmatched.payments)

      // Clear previous auto matches and suggestions
      setAutoMatches([])
      setSuggestions([])
      setGroupSuggestions([])
    } catch (error) {
      console.error('Error refreshing data:', error)
      toast.error('Błąd podczas pobierania danych')
    } finally {
      setIsLoading(false)
    }
  }, [currentCompany])

  const runAutoMatch = useCallback(async () => {
    if (!currentCompany) {
      toast.error('Nie wybrano firmy')
      return
    }

    setIsProcessing(true)
    setProgress({ current: 0, total: 100, phase: 'analyzing', message: 'Analizowanie płatności...' })

    try {
      console.log('\n🔄 useMatching.runAutoMatch() - START')
      console.log(`   Niedopasowane faktury: ${unmatchedInvoices.length}`)
      console.log(`   Niedopasowane płatności: ${unmatchedPayments.length}`)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        toast.error('Sesja wygasła')
        setProgress(null)
        return
      }

      // Find matches using the extended algorithm (with grouping)
      setProgress({ current: 10, total: 100, phase: 'analyzing', message: 'Porównywanie faktur z płatnościami...' })
      const result = findMatchesExtended(unmatchedInvoices, unmatchedPayments, {
        enableGroupMatching: true,
        maxMonthsToGroup: 2,
        debug: true,
      })

      console.log('🔄 useMatching.runAutoMatch() - wyniki z findMatchesExtended:')
      console.log(`   autoMatches: ${result.autoMatches.length}`)
      console.log(`   suggestions: ${result.suggestions.length}`)
      console.log(`   groupSuggestions: ${result.groupSuggestions.length}`)

      // Auto-matches with confidence >= 85% are automatically saved to database
      if (result.autoMatches.length > 0) {
        setProgress({
          current: 30,
          total: 100,
          phase: 'saving',
          message: `Zapisywanie ${result.autoMatches.length} dopasowań...`
        })

        let savedCount = 0
        for (const match of result.autoMatches) {
          try {
            // Create match record
            const { error: matchError } = await supabase.from('matches').insert({
              user_id: user.id,
              company_id: currentCompany.id,
              invoice_id: match.invoiceId,
              payment_id: match.paymentId,
              confidence_score: match.confidence,
              match_type: 'auto',
              matched_by: user.id,
            })

            if (matchError) {
              console.error('Error saving match:', matchError)
              continue
            }

            // Update invoice status to paid
            const { error: invoiceError } = await supabase
              .from('invoices')
              .update({ payment_status: 'paid' })
              .eq('id', match.invoiceId)

            if (invoiceError) {
              console.error('Error updating invoice:', invoiceError)
            }

            savedCount++

            // Update progress
            const progressPercent = 30 + Math.round((savedCount / result.autoMatches.length) * 50)
            setProgress({
              current: progressPercent,
              total: 100,
              phase: 'saving',
              message: `Zapisano ${savedCount} z ${result.autoMatches.length} dopasowań...`
            })
          } catch (error) {
            console.error('Error in auto-match save:', error)
          }
        }

        console.log(`✅ Automatycznie zapisano ${savedCount} dopasowań do bazy`)
      }

      // Clear autoMatches since they've been saved - no need to show them for confirmation
      setAutoMatches([])

      // Create suggestions with full invoice/payment data (only for matches below 85%)
      setProgress({ current: 85, total: 100, phase: 'analyzing', message: 'Przygotowywanie sugestii...' })

      // Process regular suggestions (MatchResult -> MatchSuggestion)
      const suggestionsList: MatchSuggestion[] = result.suggestions
        .filter((s): s is MatchResult => 'invoiceId' in s && 'paymentId' in s)
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

      // Add any MatchSuggestion objects that already have invoice/payment data
      const directSuggestions = result.suggestions
        .filter((s): s is MatchSuggestion => 'invoice' in s && 'payment' in s)

      setSuggestions([...suggestionsList, ...directSuggestions])

      // Set group suggestions
      setGroupSuggestions(result.groupSuggestions)

      console.log(`💡 Przygotowano ${suggestionsList.length + directSuggestions.length} sugestii pojedynczych`)
      console.log(`🔗 Przygotowano ${result.groupSuggestions.length} sugestii grupowych`)

      setProgress({ current: 100, total: 100, phase: 'complete', message: 'Zakończono!' })

      // Show results
      const totalSuggestions = suggestionsList.length + directSuggestions.length
      const groupCount = result.groupSuggestions.length

      if (result.autoMatches.length > 0) {
        let message = `Automatycznie dopasowano ${result.autoMatches.length} faktur.`
        if (totalSuggestions > 0 || groupCount > 0) {
          const parts = []
          if (totalSuggestions > 0) parts.push(`${totalSuggestions} sugestii`)
          if (groupCount > 0) parts.push(`${groupCount} sugestii grupowych`)
          message += ` Pozostało ${parts.join(' i ')} do weryfikacji.`
        }
        toast.success(message)
      } else if (totalSuggestions > 0 || groupCount > 0) {
        const parts = []
        if (totalSuggestions > 0) parts.push(`${totalSuggestions} potencjalnych dopasowań`)
        if (groupCount > 0) parts.push(`${groupCount} dopasowań grupowych`)
        toast.info(`Znaleziono ${parts.join(' i ')} do weryfikacji`)
      } else {
        toast.info('Nie znaleziono nowych dopasowań')
      }

      // Refresh data to get updated matches
      await refresh()

    } catch (error) {
      console.error('Error running auto-match:', error)
      toast.error('Błąd podczas automatycznego dopasowywania')
    } finally {
      setIsProcessing(false)
      // Keep progress visible for a moment before clearing
      setTimeout(() => setProgress(null), 2000)
    }
  }, [unmatchedInvoices, unmatchedPayments, invoicesCache, paymentsCache, refresh, currentCompany])

  const confirmMatch = useCallback(
    async (invoiceId: string, paymentId: string) => {
      if (!currentCompany) {
        toast.error('Nie wybrano firmy')
        return
      }

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
          company_id: currentCompany.id,
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
    [invoicesCache, paymentsCache, refresh, currentCompany]
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

  const rejectGroupSuggestion = useCallback(
    (paymentId: string) => {
      // Remove from group suggestions list
      setGroupSuggestions((prev) =>
        prev.filter((s) => s.payment.id !== paymentId)
      )

      toast.info('Sugestia grupowa odrzucona')
    },
    []
  )

  const confirmGroupMatch = useCallback(
    async (suggestion: GroupMatchSuggestion) => {
      if (!currentCompany) {
        toast.error('Nie wybrano firmy')
        return
      }

      setIsProcessing(true)

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          toast.error('Sesja wygasła')
          return
        }

        console.log(`🔗 Potwierdzam dopasowanie grupowe: ${suggestion.invoices.length} faktur → płatność ${suggestion.payment.id}`)

        // Create match records for each invoice in the group
        let savedCount = 0
        for (const invoice of suggestion.invoices) {
          try {
            // Create match record
            const { error: matchError } = await supabase.from('matches').insert({
              user_id: user.id,
              company_id: currentCompany.id,
              invoice_id: invoice.id,
              payment_id: suggestion.payment.id,
              confidence_score: suggestion.confidence,
              match_type: 'auto', // or 'group' if you want to track this separately
              matched_by: user.id,
            })

            if (matchError) {
              console.error('Error saving group match for invoice:', invoice.id, matchError)
              continue
            }

            // Update invoice status to paid
            const { error: invoiceError } = await supabase
              .from('invoices')
              .update({ payment_status: 'paid' })
              .eq('id', invoice.id)

            if (invoiceError) {
              console.error('Error updating invoice:', invoiceError)
            }

            savedCount++
          } catch (error) {
            console.error('Error in group match save for invoice:', invoice.id, error)
          }
        }

        if (savedCount === suggestion.invoices.length) {
          toast.success(`Dopasowano ${savedCount} faktur do jednej płatności (${suggestion.totalInvoiceAmount.toFixed(2)} PLN)`)
        } else if (savedCount > 0) {
          toast.warning(`Dopasowano ${savedCount} z ${suggestion.invoices.length} faktur`)
        } else {
          toast.error('Błąd podczas zapisywania dopasowań')
        }

        // Remove from group suggestions
        setGroupSuggestions((prev) =>
          prev.filter((s) => s.payment.id !== suggestion.payment.id)
        )

        // Refresh data
        await refresh()
      } catch (error) {
        console.error('Error confirming group match:', error)
        toast.error('Błąd podczas potwierdzania dopasowania grupowego')
      } finally {
        setIsProcessing(false)
      }
    },
    [refresh, currentCompany]
  )

  const createManualMatch = useCallback(
    async (invoiceId: string, paymentId: string) => {
      if (!currentCompany) {
        toast.error('Nie wybrano firmy')
        return
      }

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
          company_id: currentCompany.id,
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
    [invoicesCache, paymentsCache, refresh, currentCompany]
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

  const deleteInvoice = useCallback(
    async (invoiceId: string) => {
      setIsProcessing(true)

      try {
        // First delete any matches for this invoice
        const { error: matchesError } = await supabase
          .from('matches')
          .delete()
          .eq('invoice_id', invoiceId)

        if (matchesError) {
          console.error('Error deleting matches:', matchesError)
        }

        // Delete the invoice
        const { error: invoiceError } = await supabase
          .from('invoices')
          .delete()
          .eq('id', invoiceId)

        if (invoiceError) throw invoiceError

        toast.success('Faktura usunięta')

        // Refresh data
        await refresh()
      } catch (error) {
        console.error('Error deleting invoice:', error)
        toast.error('Błąd podczas usuwania faktury')
      } finally {
        setIsProcessing(false)
      }
    },
    [refresh]
  )

  const deletePayment = useCallback(
    async (paymentId: string) => {
      setIsProcessing(true)

      try {
        // First get any matches for this payment to update invoice status
        const { data: matches } = await supabase
          .from('matches')
          .select('invoice_id')
          .eq('payment_id', paymentId)

        // Delete any matches for this payment
        const { error: matchesError } = await supabase
          .from('matches')
          .delete()
          .eq('payment_id', paymentId)

        if (matchesError) {
          console.error('Error deleting matches:', matchesError)
        }

        // Update related invoices back to pending
        if (matches && matches.length > 0) {
          for (const match of matches) {
            await supabase
              .from('invoices')
              .update({ payment_status: 'pending' })
              .eq('id', match.invoice_id)
          }
        }

        // Delete the payment
        const { error: paymentError } = await supabase
          .from('payments')
          .delete()
          .eq('id', paymentId)

        if (paymentError) throw paymentError

        toast.success('Płatność usunięta')

        // Refresh data
        await refresh()
      } catch (error) {
        console.error('Error deleting payment:', error)
        toast.error('Błąd podczas usuwania płatności')
      } finally {
        setIsProcessing(false)
      }
    },
    [refresh]
  )

  const updateInvoicePaymentStatus = useCallback(
    async (invoiceId: string, status: 'pending' | 'paid' | 'overdue' | 'partial' | 'canceled'): Promise<boolean> => {
      try {
        const { error } = await supabase
          .from('invoices')
          .update({ payment_status: status })
          .eq('id', invoiceId)

        if (error) {
          console.error('Error updating invoice status:', error)
          return false
        }

        // Update local cache immediately for instant UI feedback
        setInvoicesCache((prev) => {
          const newCache = new Map(prev)
          const invoice = newCache.get(invoiceId)
          if (invoice) {
            newCache.set(invoiceId, { ...invoice, payment_status: status })
          }
          return newCache
        })

        return true
      } catch (error) {
        console.error('Error updating invoice payment status:', error)
        return false
      }
    },
    []
  )

  const updateInvoiceFakturowniaStatus = useCallback(
    async (invoiceId: string, status: 'issued' | 'paid'): Promise<boolean> => {
      try {
        // Map Fakturownia status to local payment_status
        const paymentStatus = status === 'paid' ? 'paid' : 'pending'

        const { error } = await supabase
          .from('invoices')
          .update({
            fakturownia_status: status,
            payment_status: paymentStatus
          })
          .eq('id', invoiceId)

        if (error) {
          console.error('Error updating invoice fakturownia status:', error)
          return false
        }

        // Update local cache immediately for instant UI feedback
        setInvoicesCache((prev) => {
          const newCache = new Map(prev)
          const invoice = newCache.get(invoiceId)
          if (invoice) {
            newCache.set(invoiceId, {
              ...invoice,
              fakturownia_status: status,
              payment_status: paymentStatus
            })
          }
          return newCache
        })

        return true
      } catch (error) {
        console.error('Error updating invoice fakturownia status:', error)
        return false
      }
    },
    []
  )

  return {
    isLoading,
    isProcessing,
    progress,
    autoMatches,
    suggestions,
    groupSuggestions,
    confirmedMatches,
    unmatchedInvoices,
    unmatchedPayments,
    invoicesCache,
    paymentsCache,
    runAutoMatch,
    confirmMatch,
    confirmGroupMatch,
    rejectSuggestion,
    rejectGroupSuggestion,
    createManualMatch,
    removeMatch,
    deleteInvoice,
    deletePayment,
    updateInvoicePaymentStatus,
    updateInvoiceFakturowniaStatus,
    refresh,
  }
}
