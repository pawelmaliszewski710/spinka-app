import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Invoice } from '@/types'

interface OverdueStats {
  totalCount: number
  totalAmount: number
  averageDaysOverdue: number
  byAgeGroup: {
    '1-7': { count: number; amount: number }
    '8-30': { count: number; amount: number }
    '31-60': { count: number; amount: number }
    '60+': { count: number; amount: number }
  }
}

interface OverdueInvoice extends Invoice {
  daysOverdue: number
}

interface UseOverdueResult {
  invoices: OverdueInvoice[]
  stats: OverdueStats | null
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
  exportToCsv: () => void
  copyToClipboard: (invoice: OverdueInvoice) => void
  copyAllToClipboard: () => void
}

const initialStats: OverdueStats = {
  totalCount: 0,
  totalAmount: 0,
  averageDaysOverdue: 0,
  byAgeGroup: {
    '1-7': { count: 0, amount: 0 },
    '8-30': { count: 0, amount: 0 },
    '31-60': { count: 0, amount: 0 },
    '60+': { count: 0, amount: 0 },
  },
}

function calculateDaysOverdue(dueDate: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0)
  const diffTime = today.getTime() - due.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return Math.max(0, diffDays)
}

function getAgeGroup(days: number): '1-7' | '8-30' | '31-60' | '60+' {
  if (days <= 7) return '1-7'
  if (days <= 30) return '8-30'
  if (days <= 60) return '31-60'
  return '60+'
}

export function useOverdue(): UseOverdueResult {
  const [invoices, setInvoices] = useState<OverdueInvoice[]>([])
  const [stats, setStats] = useState<OverdueStats | null>(null)
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

      const today = new Date().toISOString().split('T')[0]

      // Fetch overdue invoices (either marked as overdue or pending with past due date)
      const { data, error: fetchError } = await supabase
        .from('invoices')
        .select('*')
        .eq('user_id', user.id)
        .or(`payment_status.eq.overdue,and(payment_status.eq.pending,due_date.lt.${today})`)
        .order('due_date', { ascending: true })

      if (fetchError) throw fetchError

      const invoicesData = data || []

      // Calculate days overdue for each invoice
      const overdueInvoices: OverdueInvoice[] = invoicesData.map((inv) => ({
        ...inv,
        daysOverdue: calculateDaysOverdue(inv.due_date),
      }))

      setInvoices(overdueInvoices)

      // Update status to overdue in database if needed
      const needsUpdate = invoicesData.filter(
        (inv) => inv.payment_status === 'pending' && inv.due_date < today
      )
      if (needsUpdate.length > 0) {
        await supabase
          .from('invoices')
          .update({ payment_status: 'overdue' })
          .in(
            'id',
            needsUpdate.map((i) => i.id)
          )
      }

      // Calculate stats
      const newStats: OverdueStats = { ...initialStats }
      newStats.totalCount = overdueInvoices.length
      newStats.totalAmount = overdueInvoices.reduce((sum, inv) => sum + inv.gross_amount, 0)

      if (overdueInvoices.length > 0) {
        newStats.averageDaysOverdue = Math.round(
          overdueInvoices.reduce((sum, inv) => sum + inv.daysOverdue, 0) / overdueInvoices.length
        )
      }

      // Group by age
      newStats.byAgeGroup = {
        '1-7': { count: 0, amount: 0 },
        '8-30': { count: 0, amount: 0 },
        '31-60': { count: 0, amount: 0 },
        '60+': { count: 0, amount: 0 },
      }

      overdueInvoices.forEach((inv) => {
        const group = getAgeGroup(inv.daysOverdue)
        newStats.byAgeGroup[group].count++
        newStats.byAgeGroup[group].amount += inv.gross_amount
      })

      setStats(newStats)
    } catch (err) {
      console.error('Error fetching overdue invoices:', err)
      setError('Błąd podczas pobierania danych')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const exportToCsv = useCallback(() => {
    if (invoices.length === 0) return

    const headers = [
      'Nr faktury',
      'Nabywca',
      'NIP',
      'Kwota brutto',
      'Waluta',
      'Termin płatności',
      'Dni po terminie',
    ]

    const rows = invoices.map((inv) => [
      inv.invoice_number,
      inv.buyer_name,
      inv.buyer_nip || '',
      inv.gross_amount.toFixed(2),
      inv.currency,
      inv.due_date,
      inv.daysOverdue.toString(),
    ])

    const csvContent = [
      headers.join(';'),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(';')),
    ].join('\n')

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `zaleglosci_${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [invoices])

  const copyToClipboard = useCallback((invoice: OverdueInvoice) => {
    const text = [
      `Faktura: ${invoice.invoice_number}`,
      `Nabywca: ${invoice.buyer_name}`,
      invoice.buyer_nip ? `NIP: ${invoice.buyer_nip}` : null,
      `Kwota: ${invoice.gross_amount.toFixed(2)} ${invoice.currency}`,
      `Termin płatności: ${invoice.due_date}`,
      `Dni po terminie: ${invoice.daysOverdue}`,
    ]
      .filter(Boolean)
      .join('\n')

    navigator.clipboard.writeText(text)
  }, [])

  const copyAllToClipboard = useCallback(() => {
    if (invoices.length === 0) return

    const text = invoices
      .map((inv) =>
        [
          `Faktura: ${inv.invoice_number}`,
          `Nabywca: ${inv.buyer_name}`,
          inv.buyer_nip ? `NIP: ${inv.buyer_nip}` : null,
          `Kwota: ${inv.gross_amount.toFixed(2)} ${inv.currency}`,
          `Termin: ${inv.due_date} (${inv.daysOverdue} dni po terminie)`,
          '---',
        ]
          .filter(Boolean)
          .join('\n')
      )
      .join('\n')

    navigator.clipboard.writeText(text)
  }, [invoices])

  return {
    invoices,
    stats,
    isLoading,
    error,
    refresh,
    exportToCsv,
    copyToClipboard,
    copyAllToClipboard,
  }
}
