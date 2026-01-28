import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import {
  CircleDollarSign,
  CheckCircle2,
  Clock,
  AlertTriangle,
  TrendingUp,
  Calendar,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { Invoice } from '@/types'

// ============================================
// Types
// ============================================

export interface InvoiceAnalyticsProps {
  invoices: Invoice[]
  isLoading?: boolean
}

interface AgingBucket {
  label: string
  minDays: number
  maxDays: number | null
  count: number
  amount: number
  color: string
}

interface AnalyticsData {
  // Totals
  totalCount: number
  totalAmount: number

  // By status
  paidCount: number
  paidAmount: number
  pendingCount: number
  pendingAmount: number
  partialCount: number
  partialAmount: number
  canceledCount: number
  canceledAmount: number

  // Overdue analysis
  overdueCount: number
  overdueAmount: number
  avgDaysOverdue: number
  maxDaysOverdue: number

  // Aging buckets (for unpaid invoices past due date)
  agingBuckets: AgingBucket[]

  // Percentages
  paidPercentage: number
  overduePercentage: number
}

// ============================================
// Helper Functions
// ============================================

function calculateDaysOverdue(dueDate: string): number {
  const due = new Date(dueDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)

  const diffTime = today.getTime() - due.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  return Math.max(0, diffDays)
}

function calculateAnalytics(invoices: Invoice[]): AnalyticsData {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Initialize counters
  let paidCount = 0, paidAmount = 0
  let pendingCount = 0, pendingAmount = 0
  let partialCount = 0, partialAmount = 0
  let canceledCount = 0, canceledAmount = 0

  // Track overdue invoices
  const overdueInvoices: Array<{ invoice: Invoice; daysOverdue: number }> = []

  // Process each invoice
  for (const invoice of invoices) {
    const amount = invoice.gross_amount

    switch (invoice.payment_status) {
      case 'paid':
        paidCount++
        paidAmount += amount
        break
      case 'pending':
        pendingCount++
        pendingAmount += amount
        // Check if overdue
        const dueDate = new Date(invoice.due_date)
        dueDate.setHours(0, 0, 0, 0)
        if (today > dueDate) {
          const daysOverdue = calculateDaysOverdue(invoice.due_date)
          overdueInvoices.push({ invoice, daysOverdue })
        }
        break
      case 'partial':
        partialCount++
        partialAmount += amount
        break
      case 'canceled':
        canceledCount++
        canceledAmount += amount
        break
      case 'overdue':
        // Explicitly marked as overdue
        pendingCount++
        pendingAmount += amount
        const overdueDays = calculateDaysOverdue(invoice.due_date)
        overdueInvoices.push({ invoice, daysOverdue: overdueDays })
        break
    }
  }

  // Calculate overdue statistics
  const overdueCount = overdueInvoices.length
  const overdueAmount = overdueInvoices.reduce((sum, item) => sum + item.invoice.gross_amount, 0)
  const avgDaysOverdue = overdueCount > 0
    ? Math.round(overdueInvoices.reduce((sum, item) => sum + item.daysOverdue, 0) / overdueCount)
    : 0
  const maxDaysOverdue = overdueCount > 0
    ? Math.max(...overdueInvoices.map(item => item.daysOverdue))
    : 0

  // Calculate aging buckets
  const bucketDefs: Array<{ label: string; minDays: number; maxDays: number | null; color: string }> = [
    { label: '1-30 dni', minDays: 1, maxDays: 30, color: 'bg-yellow-500' },
    { label: '31-60 dni', minDays: 31, maxDays: 60, color: 'bg-orange-500' },
    { label: '61-90 dni', minDays: 61, maxDays: 90, color: 'bg-red-500' },
    { label: '90+ dni', minDays: 91, maxDays: null, color: 'bg-red-700' },
  ]

  const agingBuckets: AgingBucket[] = bucketDefs.map(def => {
    const bucketed = overdueInvoices.filter(item => {
      if (def.maxDays === null) {
        return item.daysOverdue >= def.minDays
      }
      return item.daysOverdue >= def.minDays && item.daysOverdue <= def.maxDays
    })

    return {
      ...def,
      count: bucketed.length,
      amount: bucketed.reduce((sum, item) => sum + item.invoice.gross_amount, 0),
    }
  })

  // Total calculations
  const totalCount = invoices.length
  const totalAmount = invoices.reduce((sum, inv) => sum + inv.gross_amount, 0)

  // Percentages
  const paidPercentage = totalAmount > 0 ? (paidAmount / totalAmount) * 100 : 0
  const overduePercentage = totalAmount > 0 ? (overdueAmount / totalAmount) * 100 : 0

  return {
    totalCount,
    totalAmount,
    paidCount,
    paidAmount,
    pendingCount,
    pendingAmount,
    partialCount,
    partialAmount,
    canceledCount,
    canceledAmount,
    overdueCount,
    overdueAmount,
    avgDaysOverdue,
    maxDaysOverdue,
    agingBuckets,
    paidPercentage,
    overduePercentage,
  }
}

// ============================================
// Component
// ============================================

export function InvoiceAnalytics({ invoices, isLoading }: InvoiceAnalyticsProps): React.JSX.Element {
  const analytics = useMemo(() => calculateAnalytics(invoices), [invoices])

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="animate-pulse text-muted-foreground">Ładowanie analityki...</div>
        </CardContent>
      </Card>
    )
  }

  if (invoices.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <CircleDollarSign className="h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">Brak faktur do analizy</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Main stats grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Total */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Razem faktury</CardTitle>
            <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(analytics.totalAmount)}</div>
            <p className="text-xs text-muted-foreground">
              {analytics.totalCount} faktur
            </p>
          </CardContent>
        </Card>

        {/* Paid */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Opłacone</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(analytics.paidAmount)}
            </div>
            <p className="text-xs text-muted-foreground">
              {analytics.paidCount} faktur ({analytics.paidPercentage.toFixed(1)}%)
            </p>
          </CardContent>
        </Card>

        {/* Pending (not overdue) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Oczekujące</CardTitle>
            <Clock className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(analytics.pendingAmount - analytics.overdueAmount)}
            </div>
            <p className="text-xs text-muted-foreground">
              {analytics.pendingCount - analytics.overdueCount} faktur (w terminie)
            </p>
          </CardContent>
        </Card>

        {/* Overdue */}
        <Card className="border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Przeterminowane</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(analytics.overdueAmount)}
            </div>
            <p className="text-xs text-muted-foreground">
              {analytics.overdueCount} faktur ({analytics.overduePercentage.toFixed(1)}%)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Payment progress bar */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Postęp płatności
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Progress value={analytics.paidPercentage} className="h-3" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Opłacone: {formatCurrency(analytics.paidAmount)}</span>
              <span>Pozostało: {formatCurrency(analytics.totalAmount - analytics.paidAmount)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Overdue details and aging buckets */}
      {analytics.overdueCount > 0 && (
        <Card className="border-red-200 dark:border-red-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4 text-red-600" />
              Analiza przeterminowań
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {/* Overdue stats */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Średnie opóźnienie:</span>
                  <Badge variant="destructive">{analytics.avgDaysOverdue} dni</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Maksymalne opóźnienie:</span>
                  <Badge variant="destructive">{analytics.maxDaysOverdue} dni</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Kwota przeterminowana:</span>
                  <span className="font-semibold text-red-600">{formatCurrency(analytics.overdueAmount)}</span>
                </div>
              </div>

              {/* Aging buckets */}
              <div className="space-y-2">
                <div className="text-sm font-medium mb-2">Struktura wiekowa zaległości:</div>
                {analytics.agingBuckets.map((bucket) => (
                  <div key={bucket.label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{bucket.label}</span>
                      <span className="font-medium">
                        {bucket.count} ({formatCurrency(bucket.amount)})
                      </span>
                    </div>
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full ${bucket.color} transition-all`}
                        style={{
                          width: `${analytics.overdueAmount > 0 ? (bucket.amount / analytics.overdueAmount) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick summary line */}
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span>Częściowo opłacone: {analytics.partialCount} ({formatCurrency(analytics.partialAmount)})</span>
        <span>•</span>
        <span>Anulowane: {analytics.canceledCount} ({formatCurrency(analytics.canceledAmount)})</span>
      </div>
    </div>
  )
}

export default InvoiceAnalytics
