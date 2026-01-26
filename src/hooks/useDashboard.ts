import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Invoice, Payment, Match } from '@/types'

interface DashboardStats {
  invoices: {
    total: number
    pending: number
    paid: number
    overdue: number
    partial: number
  }
  amounts: {
    totalGross: number
    pending: number
    paid: number
    overdue: number
  }
  payments: {
    total: number
    matched: number
    unmatched: number
    totalAmount: number
  }
  matches: {
    total: number
    auto: number
    manual: number
  }
}


interface UseDashboardResult {
  stats: DashboardStats | null
  recentInvoices: Invoice[]
  recentPayments: Payment[]
  recentMatches: Match[]
  overdueInvoices: Invoice[]
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}


export function useDashboard(): UseDashboardResult {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([])
  const [recentPayments, setRecentPayments] = useState<Payment[]>([])
  const [recentMatches, setRecentMatches] = useState<Match[]>([])
  const [overdueInvoices, setOverdueInvoices] = useState<Invoice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setError('Nie zalogowano')
        return
      }

      // Fetch all data in parallel
      const [invoicesResult, paymentsResult, matchesResult] = await Promise.all([
        supabase
          .from('invoices')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('payments')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
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

      // Calculate invoice stats
      const invoiceStats = {
        total: invoices.length,
        pending: invoices.filter((i) => i.payment_status === 'pending').length,
        paid: invoices.filter((i) => i.payment_status === 'paid').length,
        overdue: invoices.filter((i) => i.payment_status === 'overdue').length,
        partial: invoices.filter((i) => i.payment_status === 'partial').length,
      }

      // Calculate amounts
      const amounts = {
        totalGross: invoices.reduce((sum, i) => sum + i.gross_amount, 0),
        pending: invoices
          .filter((i) => i.payment_status === 'pending')
          .reduce((sum, i) => sum + i.gross_amount, 0),
        paid: invoices
          .filter((i) => i.payment_status === 'paid')
          .reduce((sum, i) => sum + i.gross_amount, 0),
        overdue: invoices
          .filter((i) => i.payment_status === 'overdue')
          .reduce((sum, i) => sum + i.gross_amount, 0),
      }

      // Calculate payment stats
      const matchedPaymentIds = new Set(matches.map((m) => m.payment_id))
      const paymentStats = {
        total: payments.length,
        matched: payments.filter((p) => matchedPaymentIds.has(p.id)).length,
        unmatched: payments.filter((p) => !matchedPaymentIds.has(p.id)).length,
        totalAmount: payments.reduce((sum, p) => sum + p.amount, 0),
      }

      // Calculate match stats
      const matchStats = {
        total: matches.length,
        auto: matches.filter((m) => m.match_type === 'auto').length,
        manual: matches.filter((m) => m.match_type === 'manual').length,
      }

      setStats({
        invoices: invoiceStats,
        amounts,
        payments: paymentStats,
        matches: matchStats,
      })

      // Set recent items (last 5)
      setRecentInvoices(invoices.slice(0, 5))
      setRecentPayments(payments.slice(0, 5))
      setRecentMatches(matches.slice(0, 5))

      // Find overdue invoices (pending + past due date)
      const today = new Date().toISOString().split('T')[0]
      const overdue = invoices.filter(
        (i) => i.payment_status === 'pending' && i.due_date < today
      )
      setOverdueInvoices(overdue)

      // Update overdue status in database if needed
      if (overdue.length > 0) {
        const overdueIds = overdue.map((i) => i.id)
        await supabase
          .from('invoices')
          .update({ payment_status: 'overdue' })
          .in('id', overdueIds)
      }
    } catch (err) {
      console.error('Dashboard error:', err)
      setError('Błąd podczas pobierania danych')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return {
    stats,
    recentInvoices,
    recentPayments,
    recentMatches,
    overdueInvoices,
    isLoading,
    error,
    refresh,
  }
}
