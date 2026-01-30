import { useEffect, useState, useMemo, useCallback } from 'react'
import { PageContainer } from '@/components/layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Link2,
  Loader2,
  RefreshCw,
  Wand2,
  Check,
  X,
  Trash2,
  ArrowRight,
  CheckCircle2,
  Copy,
  CreditCard,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  FileText,
  Building2,
  Calendar,
  Hash,
  Banknote,
  User,
  Info,
  Send,
  AlertCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import { useMatching } from '@/hooks/useMatching'
import { useFakturownia } from '@/hooks/useFakturownia'
import { getMatchQuality } from '@/lib/matching'
import type { GroupMatchSuggestion } from '@/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import { InvoiceAnalytics } from '@/components/analytics/InvoiceAnalytics'
import { RESOURCE_LIMITS } from '@/lib/constants'
import { OnboardingTip } from '@/components/onboarding'

// Helper to copy text to clipboard
function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text)
  toast.success(`Skopiowano: ${text}`)
}

// Short ID component with copy functionality
function ShortId({ id, prefix = '' }: { id: string; prefix?: string }): React.JSX.Element {
  const shortId = id.slice(0, 8)
  return (
    <button
      onClick={() => copyToClipboard(id)}
      className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
      title={`Pełne ID: ${id}\nKliknij aby skopiować`}
    >
      {prefix}{shortId}
      <Copy className="h-3 w-3" />
    </button>
  )
}

export function MatchingPage(): React.JSX.Element {
  const {
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
    updateInvoiceFakturowniaStatus,
    refresh,
  } = useMatching()

  const [selectedTab, setSelectedTab] = useState<'suggestions' | 'confirmed' | 'unmatched' | 'payments'>('suggestions')
  const [analyticsOpen, setAnalyticsOpen] = useState(true)
  const [suggestionPage, setSuggestionPage] = useState(0)
  const [selectedMatchDetails, setSelectedMatchDetails] = useState<{
    match: typeof confirmedMatches[number]
    invoice: ReturnType<typeof invoicesCache.get>
    payment: ReturnType<typeof paymentsCache.get>
  } | null>(null)

  // Sorting state for tables
  type SortDirection = 'asc' | 'desc' | null
  type ConfirmedMatchesSortColumn = 'invoice_number' | 'buyer_name' | 'amount' | 'confidence' | 'match_type'
  type UnmatchedInvoicesSortColumn = 'invoice_number' | 'buyer_name' | 'amount' | 'due_date'
  type UnmatchedPaymentsSortColumn = 'transaction_date' | 'sender_name' | 'title' | 'amount'

  const [confirmedMatchesSort, setConfirmedMatchesSort] = useState<{
    column: ConfirmedMatchesSortColumn | null
    direction: SortDirection
  }>({ column: null, direction: null })

  const [unmatchedInvoicesSort, setUnmatchedInvoicesSort] = useState<{
    column: UnmatchedInvoicesSortColumn | null
    direction: SortDirection
  }>({ column: null, direction: null })

  const [unmatchedPaymentsSort, setUnmatchedPaymentsSort] = useState<{
    column: UnmatchedPaymentsSortColumn | null
    direction: SortDirection
  }>({ column: null, direction: null })

  // Fakturownia integration
  const {
    isConfigured: isFakturowniaConfigured,
    isCheckingConfig: isCheckingFakturowniaConfig,
    changeInvoiceStatus,
    markMultipleInvoicesAsPaid,
    isLoading: isFakturowniaLoading,
  } = useFakturownia()

  type FakturowniaStatus = 'issued' | 'paid'

  // State for bulk Fakturownia update
  const [fakturowniaProgress, setFakturowniaProgress] = useState<{
    isRunning: boolean
    current: number
    total: number
  } | null>(null)
  const [sendingToFakturowniaIds, setSendingToFakturowniaIds] = useState<Set<string>>(new Set())

  // Get all invoices as array for analytics
  const allInvoices = useMemo(() => Array.from(invoicesCache.values()), [invoicesCache])

  // Paginated suggestions to prevent browser crash
  const paginatedSuggestions = useMemo(() => {
    const start = suggestionPage * RESOURCE_LIMITS.SUGGESTIONS_PER_PAGE
    return suggestions.slice(start, start + RESOURCE_LIMITS.SUGGESTIONS_PER_PAGE)
  }, [suggestions, suggestionPage])

  const totalSuggestionPages = Math.ceil(suggestions.length / RESOURCE_LIMITS.SUGGESTIONS_PER_PAGE)

  // Reset page when suggestions change
  useEffect(() => {
    setSuggestionPage(0)
  }, [suggestions])

  // Manual matching state (with search)
  const [searchInvoiceId, setSearchInvoiceId] = useState('')
  const [paymentSearchQuery, setPaymentSearchQuery] = useState('')
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null)

  useEffect(() => {
    refresh()
  }, [refresh])

  // Filter payments based on search query
  const filteredPayments = paymentSearchQuery.trim().length >= 2
    ? unmatchedPayments.filter(payment => {
        const query = paymentSearchQuery.toLowerCase()
        return (
          payment.sender_name?.toLowerCase().includes(query) ||
          payment.title?.toLowerCase().includes(query) ||
          payment.amount.toString().includes(query) ||
          payment.id.toLowerCase().includes(query) ||
          payment.reference?.toLowerCase().includes(query)
        )
      }).slice(0, 10) // Limit to 10 results
    : []

  const handleSearchMatch = async () => {
    if (!searchInvoiceId.trim() || !selectedPaymentId) {
      toast.error('Wybierz fakturę i płatność')
      return
    }
    await createManualMatch(searchInvoiceId.trim(), selectedPaymentId)
    setSearchInvoiceId('')
    setPaymentSearchQuery('')
    setSelectedPaymentId(null)
  }

  // Send status change to Fakturownia
  const handleChangeStatusInFakturownia = useCallback(async (
    invoiceId: string,
    fakturowniaId: number | null,
    status: FakturowniaStatus
  ) => {
    if (!fakturowniaId) {
      toast.error('Ta faktura nie ma powiązania z Fakturownia (brak fakturownia_id)')
      return
    }

    setSendingToFakturowniaIds(prev => new Set(prev).add(invoiceId))

    try {
      const success = await changeInvoiceStatus(fakturowniaId, status)
      if (success) {
        // Update both fakturownia_status and payment_status in local database and cache
        await updateInvoiceFakturowniaStatus(invoiceId, status)
      }
    } finally {
      setSendingToFakturowniaIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(invoiceId)
        return newSet
      })
    }
  }, [changeInvoiceStatus, updateInvoiceFakturowniaStatus])

  // Send all confirmed matches to Fakturownia
  const handleSendAllToFakturownia = useCallback(async () => {
    // Get all invoices with fakturownia_id from confirmed matches
    const invoicesWithFakturowniaId = confirmedMatches
      .map(match => {
        const invoice = invoicesCache.get(match.invoice_id)
        return invoice
      })
      .filter((invoice): invoice is NonNullable<typeof invoice> =>
        invoice !== undefined && invoice.fakturownia_id !== null
      )

    if (invoicesWithFakturowniaId.length === 0) {
      toast.error('Brak faktur z powiązaniem do Fakturowni')
      return
    }

    // Filter only invoices without confirmed 'paid' status in Fakturownia
    const unpaidInvoices = invoicesWithFakturowniaId.filter(
      inv => inv.fakturownia_status !== 'paid'
    )

    if (unpaidInvoices.length === 0) {
      toast.info('Wszystkie faktury są już oznaczone jako opłacone')
      return
    }

    const fakturowniaIds = unpaidInvoices.map(inv => inv.fakturownia_id as number)

    setFakturowniaProgress({ isRunning: true, current: 0, total: fakturowniaIds.length })

    try {
      const results = await markMultipleInvoicesAsPaid(fakturowniaIds, (completed, total) => {
        setFakturowniaProgress({ isRunning: true, current: completed, total })
      })

      // Update local status for successfully updated invoices
      for (const result of results) {
        if (result.success) {
          const invoice = unpaidInvoices.find(inv => inv.fakturownia_id === result.id)
          if (invoice) {
            await updateInvoiceFakturowniaStatus(invoice.id, 'paid')
          }
        }
      }
    } finally {
      setFakturowniaProgress(null)
    }
  }, [confirmedMatches, invoicesCache, markMultipleInvoicesAsPaid, updateInvoiceFakturowniaStatus])

  // Count invoices that can be sent to Fakturownia (all with fakturownia_id)
  const invoicesForFakturownia = useMemo(() => {
    return confirmedMatches
      .map(match => invoicesCache.get(match.invoice_id))
      .filter((invoice): invoice is NonNullable<typeof invoice> =>
        invoice !== undefined &&
        invoice.fakturownia_id !== null
      )
  }, [confirmedMatches, invoicesCache])

  // Sorted confirmed matches
  const sortedConfirmedMatches = useMemo(() => {
    if (!confirmedMatchesSort.column || !confirmedMatchesSort.direction) {
      return confirmedMatches
    }

    return [...confirmedMatches].sort((a, b) => {
      const invoiceA = invoicesCache.get(a.invoice_id)
      const invoiceB = invoicesCache.get(b.invoice_id)

      let comparison = 0
      switch (confirmedMatchesSort.column) {
        case 'invoice_number':
          comparison = (invoiceA?.invoice_number || '').localeCompare(invoiceB?.invoice_number || '')
          break
        case 'buyer_name':
          comparison = (invoiceA?.buyer_name || '').localeCompare(invoiceB?.buyer_name || '')
          break
        case 'amount':
          comparison = (invoiceA?.gross_amount || 0) - (invoiceB?.gross_amount || 0)
          break
        case 'confidence':
          comparison = a.confidence_score - b.confidence_score
          break
        case 'match_type':
          comparison = a.match_type.localeCompare(b.match_type)
          break
      }

      return confirmedMatchesSort.direction === 'asc' ? comparison : -comparison
    })
  }, [confirmedMatches, confirmedMatchesSort, invoicesCache])

  // Sorted unmatched invoices
  const sortedUnmatchedInvoices = useMemo(() => {
    if (!unmatchedInvoicesSort.column || !unmatchedInvoicesSort.direction) {
      return unmatchedInvoices
    }

    return [...unmatchedInvoices].sort((a, b) => {
      let comparison = 0
      switch (unmatchedInvoicesSort.column) {
        case 'invoice_number':
          comparison = a.invoice_number.localeCompare(b.invoice_number)
          break
        case 'buyer_name':
          comparison = a.buyer_name.localeCompare(b.buyer_name)
          break
        case 'amount':
          comparison = a.gross_amount - b.gross_amount
          break
        case 'due_date':
          comparison = new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
          break
      }

      return unmatchedInvoicesSort.direction === 'asc' ? comparison : -comparison
    })
  }, [unmatchedInvoices, unmatchedInvoicesSort])

  // Sorted unmatched payments
  const sortedUnmatchedPayments = useMemo(() => {
    if (!unmatchedPaymentsSort.column || !unmatchedPaymentsSort.direction) {
      return unmatchedPayments
    }

    return [...unmatchedPayments].sort((a, b) => {
      let comparison = 0
      switch (unmatchedPaymentsSort.column) {
        case 'transaction_date':
          comparison = new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime()
          break
        case 'sender_name':
          comparison = (a.sender_name || '').localeCompare(b.sender_name || '')
          break
        case 'title':
          comparison = (a.title || '').localeCompare(b.title || '')
          break
        case 'amount':
          comparison = a.amount - b.amount
          break
      }

      return unmatchedPaymentsSort.direction === 'asc' ? comparison : -comparison
    })
  }, [unmatchedPayments, unmatchedPaymentsSort])

  // Helper function to toggle sort
  function toggleSort<T>(
    column: T,
    currentSort: { column: T | null; direction: SortDirection },
    setSort: React.Dispatch<React.SetStateAction<{ column: T | null; direction: SortDirection }>>
  ) {
    if (currentSort.column !== column) {
      setSort({ column, direction: 'asc' })
    } else if (currentSort.direction === 'asc') {
      setSort({ column, direction: 'desc' })
    } else {
      setSort({ column: null, direction: null })
    }
  }

  // Sort icon component
  function SortIcon({ column, currentSort }: { column: string; currentSort: { column: string | null; direction: SortDirection } }) {
    if (currentSort.column !== column) {
      return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />
    }
    if (currentSort.direction === 'asc') {
      return <ArrowUp className="ml-1 h-3 w-3" />
    }
    return <ArrowDown className="ml-1 h-3 w-3" />
  }

  const tabs = [
    {
      id: 'suggestions' as const,
      label: 'Sugestie',
      count: autoMatches.length + suggestions.length + groupSuggestions.length,
    },
    {
      id: 'confirmed' as const,
      label: 'Potwierdzone',
      count: confirmedMatches.length,
    },
    {
      id: 'unmatched' as const,
      label: 'Niedopasowane faktury',
      count: unmatchedInvoices.length,
    },
    {
      id: 'payments' as const,
      label: 'Niedopasowane płatności',
      count: unmatchedPayments.length,
    },
  ]

  return (
    <PageContainer>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Dopasowania</h1>
            <p className="text-muted-foreground">
              Dopasuj faktury do płatności automatycznie lub ręcznie
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={isLoading || isProcessing}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Odśwież
            </Button>
            <Button
              size="sm"
              onClick={runAutoMatch}
              disabled={isLoading || isProcessing || unmatchedInvoices.length === 0}
            >
              {isProcessing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="mr-2 h-4 w-4" />
              )}
              Auto-dopasuj
            </Button>
          </div>
        </div>

        {/* Progress bar during auto-matching */}
        {progress && (
          <Card className="border-primary/50 bg-primary/5">
            <CardContent className="pt-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {progress.phase === 'complete' ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    )}
                    <span className="font-medium">{progress.message}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {progress.current}%
                  </span>
                </div>
                <Progress value={progress.current} className="h-2" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Analytics dashboard */}
        <Collapsible open={analyticsOpen} onOpenChange={setAnalyticsOpen}>
          <div className="flex items-center justify-between">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 p-0 hover:bg-transparent">
                <BarChart3 className="h-5 w-5" />
                <span className="font-semibold">Analityka finansowa</span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${analyticsOpen ? 'rotate-180' : ''}`}
                />
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent className="mt-4">
            <InvoiceAnalytics invoices={allInvoices} isLoading={isLoading} />
          </CollapsibleContent>
        </Collapsible>

        {/* Stats cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{unmatchedInvoices.length}</div>
              <p className="text-sm text-muted-foreground">Faktury do dopasowania</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{unmatchedPayments.length}</div>
              <p className="text-sm text-muted-foreground">Płatności niedopasowane</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">
                {autoMatches.length + suggestions.length + groupSuggestions.length}
              </div>
              <p className="text-sm text-muted-foreground">
                Sugestie dopasowań
                {groupSuggestions.length > 0 && (
                  <span className="ml-1 text-xs">({groupSuggestions.length} grupowych)</span>
                )}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-blue-600">{confirmedMatches.length}</div>
              <p className="text-sm text-muted-foreground">Potwierdzone dopasowania</p>
            </CardContent>
          </Card>
        </div>

        {/* Onboarding tip for new users */}
        {unmatchedInvoices.length > 0 && unmatchedPayments.length > 0 && confirmedMatches.length === 0 && autoMatches.length === 0 && suggestions.length === 0 && (
          <OnboardingTip
            id="matching-intro"
            title="Czas na dopasowanie!"
            description="Masz faktury i płatności w systemie. Teraz możesz je ze sobą dopasować."
            icon={<Wand2 className="h-5 w-5" />}
            variant="success"
            steps={[
              {
                title: 'Uruchom auto-dopasowanie',
                description: 'Kliknij przycisk "Auto-dopasuj" powyżej. System automatycznie znajdzie pasujące pary.',
              },
              {
                title: 'Przejrzyj sugestie',
                description: 'W zakładce "Sugestie" zobaczysz propozycje dopasowań z różnym poziomem pewności.',
              },
              {
                title: 'Potwierdź lub odrzuć',
                description: 'Każdą sugestię możesz zaakceptować lub odrzucić. Potwierdzone trafiają do zakładki "Potwierdzone".',
              },
            ]}
          />
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                selectedTab === tab.id
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              {selectedTab === 'suggestions' && 'Sugestie dopasowań'}
              {selectedTab === 'confirmed' && 'Potwierdzone dopasowania'}
              {selectedTab === 'unmatched' && 'Niedopasowane faktury'}
              {selectedTab === 'payments' && 'Niedopasowane płatności'}
            </CardTitle>
            <CardDescription>
              {selectedTab === 'suggestions' &&
                'Przejrzyj i potwierdź lub odrzuć sugerowane dopasowania'}
              {selectedTab === 'confirmed' &&
                'Lista potwierdzonych dopasowań faktur do płatności'}
              {selectedTab === 'unmatched' &&
                'Faktury oczekujące na dopasowanie. Kliknij ID aby skopiować i użyć do ręcznego dopasowania.'}
              {selectedTab === 'payments' &&
                'Płatności bez przypisanej faktury. Kliknij ID aby skopiować i użyć do ręcznego dopasowania.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <>
                {/* Suggestions tab */}
                {selectedTab === 'suggestions' && (
                  <>
                    {autoMatches.length === 0 && suggestions.length === 0 && groupSuggestions.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <Link2 className="h-12 w-12 text-muted-foreground/50" />
                        <h3 className="mt-4 text-lg font-medium">Brak sugestii</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Kliknij "Auto-dopasuj" aby wyszukać dopasowania
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {/* Auto matches - high confidence */}
                        {autoMatches.length > 0 && (
                          <div>
                            <h4 className="mb-2 text-sm font-medium text-green-600">
                              Pewne dopasowania ({autoMatches.length})
                            </h4>
                            <div className="space-y-2">
                              {autoMatches.map((match) => (
                                <MatchSuggestionCard
                                  key={`${match.invoiceId}-${match.paymentId}`}
                                  match={match}
                                  onConfirm={() => confirmMatch(match.invoiceId, match.paymentId)}
                                  onReject={() => rejectSuggestion(match.invoiceId, match.paymentId)}
                                  isProcessing={isProcessing}
                                />
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Group suggestions - multiple invoices per payment */}
                        {groupSuggestions.length > 0 && (
                          <div>
                            <h4 className="mb-2 text-sm font-medium text-purple-600">
                              Dopasowania grupowe - jedna płatność za wiele faktur ({groupSuggestions.length})
                            </h4>
                            <p className="mb-3 text-xs text-muted-foreground">
                              Znaleziono płatności, które mogą pokrywać sumę kilku faktur od tego samego nabywcy
                            </p>
                            <div className="space-y-3">
                              {groupSuggestions.map((suggestion) => (
                                <GroupSuggestionCard
                                  key={suggestion.payment.id}
                                  suggestion={suggestion}
                                  onConfirm={() => confirmGroupMatch(suggestion)}
                                  onReject={() => rejectGroupSuggestion(suggestion.payment.id)}
                                  isProcessing={isProcessing}
                                />
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Suggestions - medium confidence */}
                        {suggestions.length > 0 && (
                          <div>
                            <h4 className="mb-2 text-sm font-medium text-yellow-600">
                              Potencjalne dopasowania ({suggestions.length})
                            </h4>

                            {/* Warning banner for many suggestions */}
                            {suggestions.length > RESOURCE_LIMITS.WARNING_THRESHOLD && (
                              <div className="mb-3 flex items-center gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-900 dark:bg-yellow-900/20">
                                <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
                                <div className="text-sm">
                                  <span className="font-medium text-yellow-800 dark:text-yellow-200">
                                    Dużo sugestii ({suggestions.length})
                                  </span>
                                  <span className="text-yellow-700 dark:text-yellow-300 ml-1">
                                    - rozważ zmniejszenie zakresu dat lub podzielenie danych na partie.
                                  </span>
                                </div>
                              </div>
                            )}

                            <div className="space-y-2">
                              {paginatedSuggestions.map((suggestion) => (
                                <SuggestionCard
                                  key={`${suggestion.invoice.id}-${suggestion.payment.id}`}
                                  suggestion={suggestion}
                                  onConfirm={() =>
                                    confirmMatch(suggestion.invoice.id, suggestion.payment.id)
                                  }
                                  onReject={() =>
                                    rejectSuggestion(suggestion.invoice.id, suggestion.payment.id)
                                  }
                                  isProcessing={isProcessing}
                                />
                              ))}
                            </div>

                            {/* Pagination controls */}
                            {totalSuggestionPages > 1 && (
                              <div className="flex items-center justify-center gap-2 py-4 border-t mt-4">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={suggestionPage === 0}
                                  onClick={() => setSuggestionPage(p => p - 1)}
                                >
                                  <ChevronLeft className="h-4 w-4 mr-1" />
                                  Poprzednie
                                </Button>
                                <span className="text-sm text-muted-foreground px-2">
                                  Strona {suggestionPage + 1} z {totalSuggestionPages}
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={suggestionPage >= totalSuggestionPages - 1}
                                  onClick={() => setSuggestionPage(p => p + 1)}
                                >
                                  Następne
                                  <ChevronRight className="h-4 w-4 ml-1" />
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* Confirmed matches tab */}
                {selectedTab === 'confirmed' && (
                  <>
                    {/* Fakturownia bulk action */}
                    {confirmedMatches.length > 0 && isFakturowniaConfigured && (
                      <div className="mb-4 flex items-center justify-between rounded-lg border bg-muted/30 p-3">
                        <div className="flex items-center gap-3">
                          <Send className="h-5 w-5 text-blue-600" />
                          <div>
                            <div className="text-sm font-medium">
                              Zmień status w Fakturowni
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {invoicesForFakturownia.length} faktur z powiązaniem do Fakturowni
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {fakturowniaProgress && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>{fakturowniaProgress.current}/{fakturowniaProgress.total}</span>
                            </div>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                disabled={
                                  invoicesForFakturownia.length === 0 ||
                                  isFakturowniaLoading ||
                                  fakturowniaProgress?.isRunning
                                }
                              >
                                {fakturowniaProgress?.isRunning ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <Send className="mr-2 h-4 w-4" />
                                )}
                                Zmień wszystkie
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={handleSendAllToFakturownia}>
                                <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                                Oznacz wszystkie jako Opłacone
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    )}

                    {/* Fakturownia not configured warning */}
                    {confirmedMatches.length > 0 && !isCheckingFakturowniaConfig && !isFakturowniaConfigured && (
                      <div className="mb-4 flex items-center gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-950/20">
                        <AlertCircle className="h-5 w-5 text-yellow-600" />
                        <div className="text-sm">
                          <span className="font-medium">Fakturownia nie jest skonfigurowana.</span>
                          {' '}
                          <span className="text-muted-foreground">
                            Przejdź do Ustawień, aby połączyć konto i móc automatycznie oznaczać faktury jako opłacone.
                          </span>
                        </div>
                      </div>
                    )}

                    {confirmedMatches.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <Check className="h-12 w-12 text-muted-foreground/50" />
                        <h3 className="mt-4 text-lg font-medium">Brak potwierdzonych dopasowań</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Potwierdzone dopasowania pojawią się tutaj
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-lg border overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead
                                className="cursor-pointer hover:bg-muted/50 select-none"
                                onClick={() => toggleSort('invoice_number', confirmedMatchesSort, setConfirmedMatchesSort)}
                              >
                                <span className="flex items-center">
                                  Nr faktury
                                  <SortIcon column="invoice_number" currentSort={confirmedMatchesSort} />
                                </span>
                              </TableHead>
                              <TableHead
                                className="cursor-pointer hover:bg-muted/50 select-none"
                                onClick={() => toggleSort('buyer_name', confirmedMatchesSort, setConfirmedMatchesSort)}
                              >
                                <span className="flex items-center">
                                  Nabywca / Kontrahent
                                  <SortIcon column="buyer_name" currentSort={confirmedMatchesSort} />
                                </span>
                              </TableHead>
                              <TableHead
                                className="cursor-pointer hover:bg-muted/50 select-none text-right"
                                onClick={() => toggleSort('amount', confirmedMatchesSort, setConfirmedMatchesSort)}
                              >
                                <span className="flex items-center justify-end">
                                  Kwota
                                  <SortIcon column="amount" currentSort={confirmedMatchesSort} />
                                </span>
                              </TableHead>
                              <TableHead
                                className="cursor-pointer hover:bg-muted/50 select-none"
                                onClick={() => toggleSort('confidence', confirmedMatchesSort, setConfirmedMatchesSort)}
                              >
                                <span className="flex items-center">
                                  Zgodność
                                  <SortIcon column="confidence" currentSort={confirmedMatchesSort} />
                                </span>
                              </TableHead>
                              <TableHead
                                className="cursor-pointer hover:bg-muted/50 select-none"
                                onClick={() => toggleSort('match_type', confirmedMatchesSort, setConfirmedMatchesSort)}
                              >
                                <span className="flex items-center">
                                  Typ
                                  <SortIcon column="match_type" currentSort={confirmedMatchesSort} />
                                </span>
                              </TableHead>
                              {isFakturowniaConfigured && <TableHead className="w-[120px]">Fakturownia</TableHead>}
                              <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sortedConfirmedMatches.map((match) => {
                              const invoice = invoicesCache.get(match.invoice_id)
                              const payment = paymentsCache.get(match.payment_id)
                              return (
                                <TableRow
                                  key={match.id}
                                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                                  onClick={() => setSelectedMatchDetails({ match, invoice, payment })}
                                >
                                  <TableCell className="font-mono text-sm">
                                    {invoice?.invoice_number || match.invoice_id.slice(0, 8) + '...'}
                                  </TableCell>
                                  <TableCell>
                                    <div>
                                      <div className="text-sm font-medium">
                                        {invoice?.buyer_name || 'Nieznany'}
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        {payment?.sender_name || 'Nieznany'} • {payment?.title?.slice(0, 30) || ''}
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="text-sm font-medium">
                                      {invoice ? formatCurrency(invoice.gross_amount, invoice.currency) : '-'}
                                    </div>
                                    <div className="text-xs text-green-600">
                                      {payment ? '+' + formatCurrency(payment.amount, payment.currency) : '-'}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <span className={getMatchQuality(match.confidence_score).color}>
                                      {Math.round(match.confidence_score * 100)}%
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    <span
                                      className={`rounded-full px-2 py-1 text-xs ${
                                        match.match_type === 'auto'
                                          ? 'bg-blue-100 text-blue-800'
                                          : 'bg-purple-100 text-purple-800'
                                      }`}
                                    >
                                      {match.match_type === 'auto' ? 'Auto' : 'Ręczne'}
                                    </span>
                                  </TableCell>
                                  {isFakturowniaConfigured && (
                                    <TableCell>
                                      {invoice?.fakturownia_id ? (
                                        sendingToFakturowniaIds.has(invoice.id) ? (
                                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                            Aktualizuję...
                                          </span>
                                        ) : (
                                          <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                              <button
                                                onClick={(e) => e.stopPropagation()}
                                                disabled={isFakturowniaLoading}
                                                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors hover:opacity-80 disabled:opacity-50 ${
                                                  invoice.fakturownia_status === 'paid'
                                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                                    : invoice.fakturownia_status === 'issued'
                                                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                                                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                                                }`}
                                              >
                                                {invoice.fakturownia_status === 'paid' ? (
                                                  <>
                                                    <CheckCircle2 className="h-3 w-3" />
                                                    Opłacona
                                                  </>
                                                ) : invoice.fakturownia_status === 'issued' ? (
                                                  <>
                                                    <FileText className="h-3 w-3" />
                                                    Wystawiona
                                                  </>
                                                ) : (
                                                  <>
                                                    <Info className="h-3 w-3" />
                                                    Zmień status
                                                  </>
                                                )}
                                                <ChevronDown className="h-3 w-3 ml-0.5" />
                                              </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                              <DropdownMenuItem
                                                onClick={() => handleChangeStatusInFakturownia(invoice.id, invoice.fakturownia_id, 'paid')}
                                                className={invoice.fakturownia_status === 'paid' ? 'bg-green-50 dark:bg-green-900/20' : ''}
                                              >
                                                <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                                                Opłacona
                                                {invoice.fakturownia_status === 'paid' && (
                                                  <Check className="ml-auto h-4 w-4 text-green-600" />
                                                )}
                                              </DropdownMenuItem>
                                              <DropdownMenuItem
                                                onClick={() => handleChangeStatusInFakturownia(invoice.id, invoice.fakturownia_id, 'issued')}
                                                className={invoice.fakturownia_status === 'issued' ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                                              >
                                                <FileText className="mr-2 h-4 w-4 text-blue-600" />
                                                Wystawiona
                                                {invoice.fakturownia_status === 'issued' && (
                                                  <Check className="ml-auto h-4 w-4 text-blue-600" />
                                                )}
                                              </DropdownMenuItem>
                                            </DropdownMenuContent>
                                          </DropdownMenu>
                                        )
                                      ) : (
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <span className="text-xs text-muted-foreground">-</span>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              Brak powiązania z Fakturownia
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      )}
                                    </TableCell>
                                  )}
                                  <TableCell>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        removeMatch(match.id)
                                      }}
                                      disabled={isProcessing}
                                      title="Usuń dopasowanie"
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </>
                )}

                {/* Unmatched invoices tab */}
                {selectedTab === 'unmatched' && (
                  <>
                    {/* Manual matching - Search for payment */}
                    <div className="mb-6 rounded-lg border bg-muted/50 p-4">
                      <h4 className="mb-3 text-sm font-medium">Ręczne dopasowanie</h4>
                      <div className="flex flex-col gap-3">
                        <div className="flex items-end gap-3">
                          <div className="w-1/3">
                            <label className="mb-1 block text-xs text-muted-foreground">ID faktury</label>
                            <Input
                              placeholder="np. abc12345..."
                              value={searchInvoiceId}
                              onChange={(e) => setSearchInvoiceId(e.target.value)}
                              className="font-mono text-sm"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="mb-1 block text-xs text-muted-foreground">
                              Szukaj płatności (nazwa, tytuł, kwota, numer faktury...)
                            </label>
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                              <Input
                                placeholder="Wpisz min. 2 znaki..."
                                value={paymentSearchQuery}
                                onChange={(e) => {
                                  setPaymentSearchQuery(e.target.value)
                                  setSelectedPaymentId(null)
                                }}
                                className="pl-9"
                              />
                            </div>
                          </div>
                          <Button
                            onClick={handleSearchMatch}
                            disabled={isProcessing || !searchInvoiceId.trim() || !selectedPaymentId}
                          >
                            <Link2 className="mr-2 h-4 w-4" />
                            Dopasuj
                          </Button>
                        </div>

                        {/* Search results */}
                        {paymentSearchQuery.trim().length >= 2 && (
                          <div className="rounded border bg-background">
                            {filteredPayments.length === 0 ? (
                              <div className="p-3 text-center text-sm text-muted-foreground">
                                Brak wyników dla "{paymentSearchQuery}"
                              </div>
                            ) : (
                              <div className="max-h-[200px] overflow-auto">
                                {filteredPayments.map((payment) => (
                                  <button
                                    key={payment.id}
                                    onClick={() => setSelectedPaymentId(payment.id)}
                                    className={`flex w-full items-center justify-between p-3 text-left hover:bg-muted/50 ${
                                      selectedPaymentId === payment.id ? 'bg-primary/10 border-l-2 border-l-primary' : ''
                                    }`}
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium truncate">{payment.sender_name}</span>
                                        <span className="text-xs font-mono text-muted-foreground">
                                          P:{payment.id.slice(0, 8)}
                                        </span>
                                      </div>
                                      <div className="text-xs text-muted-foreground truncate">
                                        {payment.title}
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        {formatDate(payment.transaction_date)}
                                      </div>
                                    </div>
                                    <div className="text-right ml-4">
                                      <div className="font-medium text-green-600">
                                        +{formatCurrency(payment.amount, payment.currency)}
                                      </div>
                                      {selectedPaymentId === payment.id && (
                                        <Check className="h-4 w-4 text-primary ml-auto" />
                                      )}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {selectedPaymentId && (
                          <div className="text-sm text-muted-foreground">
                            Wybrana płatność: <span className="font-mono">{selectedPaymentId.slice(0, 8)}...</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {unmatchedInvoices.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <Check className="h-12 w-12 text-green-500" />
                        <h3 className="mt-4 text-lg font-medium">Wszystko dopasowane!</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Wszystkie faktury zostały dopasowane do płatności
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-lg border overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[100px]">ID</TableHead>
                              <TableHead
                                className="cursor-pointer hover:bg-muted/50 select-none"
                                onClick={() => toggleSort('invoice_number', unmatchedInvoicesSort, setUnmatchedInvoicesSort)}
                              >
                                <span className="flex items-center">
                                  Nr faktury
                                  <SortIcon column="invoice_number" currentSort={unmatchedInvoicesSort} />
                                </span>
                              </TableHead>
                              <TableHead
                                className="cursor-pointer hover:bg-muted/50 select-none"
                                onClick={() => toggleSort('buyer_name', unmatchedInvoicesSort, setUnmatchedInvoicesSort)}
                              >
                                <span className="flex items-center">
                                  Nabywca
                                  <SortIcon column="buyer_name" currentSort={unmatchedInvoicesSort} />
                                </span>
                              </TableHead>
                              <TableHead
                                className="cursor-pointer hover:bg-muted/50 select-none text-right"
                                onClick={() => toggleSort('amount', unmatchedInvoicesSort, setUnmatchedInvoicesSort)}
                              >
                                <span className="flex items-center justify-end">
                                  Kwota
                                  <SortIcon column="amount" currentSort={unmatchedInvoicesSort} />
                                </span>
                              </TableHead>
                              <TableHead
                                className="cursor-pointer hover:bg-muted/50 select-none"
                                onClick={() => toggleSort('due_date', unmatchedInvoicesSort, setUnmatchedInvoicesSort)}
                              >
                                <span className="flex items-center">
                                  Termin
                                  <SortIcon column="due_date" currentSort={unmatchedInvoicesSort} />
                                </span>
                              </TableHead>
                              <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sortedUnmatchedInvoices.map((invoice) => (
                              <TableRow key={invoice.id}>
                                <TableCell>
                                  <ShortId id={invoice.id} prefix="F:" />
                                </TableCell>
                                <TableCell className="font-mono text-sm font-medium">
                                  {invoice.invoice_number}
                                </TableCell>
                                <TableCell>{invoice.buyer_name}</TableCell>
                                <TableCell className="text-right font-medium">
                                  {formatCurrency(invoice.gross_amount, invoice.currency)}
                                </TableCell>
                                <TableCell>{formatDate(invoice.due_date)}</TableCell>
                                <TableCell>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        disabled={isProcessing}
                                        title="Usuń fakturę"
                                      >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Usunąć fakturę?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Czy na pewno chcesz usunąć fakturę <strong>{invoice.invoice_number}</strong>?
                                          Ta operacja jest nieodwracalna.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Anuluj</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => deleteInvoice(invoice.id)}
                                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        >
                                          Usuń
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </>
                )}

                {/* Unmatched payments tab */}
                {selectedTab === 'payments' && (
                  <>
                    {unmatchedPayments.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <CreditCard className="h-12 w-12 text-muted-foreground/50" />
                        <h3 className="mt-4 text-lg font-medium">Brak niedopasowanych płatności</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Wszystkie płatności zostały dopasowane do faktur
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-lg border overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[100px]">ID</TableHead>
                              <TableHead
                                className="cursor-pointer hover:bg-muted/50 select-none"
                                onClick={() => toggleSort('transaction_date', unmatchedPaymentsSort, setUnmatchedPaymentsSort)}
                              >
                                <span className="flex items-center">
                                  Data
                                  <SortIcon column="transaction_date" currentSort={unmatchedPaymentsSort} />
                                </span>
                              </TableHead>
                              <TableHead
                                className="cursor-pointer hover:bg-muted/50 select-none"
                                onClick={() => toggleSort('sender_name', unmatchedPaymentsSort, setUnmatchedPaymentsSort)}
                              >
                                <span className="flex items-center">
                                  Nadawca
                                  <SortIcon column="sender_name" currentSort={unmatchedPaymentsSort} />
                                </span>
                              </TableHead>
                              <TableHead
                                className="cursor-pointer hover:bg-muted/50 select-none"
                                onClick={() => toggleSort('title', unmatchedPaymentsSort, setUnmatchedPaymentsSort)}
                              >
                                <span className="flex items-center">
                                  Tytuł
                                  <SortIcon column="title" currentSort={unmatchedPaymentsSort} />
                                </span>
                              </TableHead>
                              <TableHead
                                className="cursor-pointer hover:bg-muted/50 select-none text-right"
                                onClick={() => toggleSort('amount', unmatchedPaymentsSort, setUnmatchedPaymentsSort)}
                              >
                                <span className="flex items-center justify-end">
                                  Kwota
                                  <SortIcon column="amount" currentSort={unmatchedPaymentsSort} />
                                </span>
                              </TableHead>
                              <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sortedUnmatchedPayments.map((payment) => (
                              <TableRow key={payment.id}>
                                <TableCell>
                                  <ShortId id={payment.id} prefix="P:" />
                                </TableCell>
                                <TableCell>{formatDate(payment.transaction_date)}</TableCell>
                                <TableCell className="max-w-[150px] truncate">
                                  {payment.sender_name}
                                </TableCell>
                                <TableCell className="max-w-[200px] truncate" title={payment.title}>
                                  {payment.title}
                                </TableCell>
                                <TableCell className="text-right font-medium text-green-600">
                                  +{formatCurrency(payment.amount, payment.currency)}
                                </TableCell>
                                <TableCell>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        disabled={isProcessing}
                                        title="Usuń płatność"
                                      >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Usunąć płatność?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Czy na pewno chcesz usunąć płatność od <strong>{payment.sender_name}</strong> na kwotę {formatCurrency(payment.amount, payment.currency)}?
                                          Ta operacja jest nieodwracalna.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Anuluj</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => deletePayment(payment.id)}
                                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        >
                                          Usuń
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Match Details Dialog */}
        <Dialog
          open={selectedMatchDetails !== null}
          onOpenChange={(open) => !open && setSelectedMatchDetails(null)}
        >
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                Szczegóły dopasowania
              </DialogTitle>
              <DialogDescription>
                Pełne informacje o fakturze i powiązanej płatności
              </DialogDescription>
            </DialogHeader>

            {selectedMatchDetails && (
              <div className="space-y-6">
                {/* Match info badge */}
                <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                  <div className="flex items-center gap-3">
                    <Badge variant={selectedMatchDetails.match.match_type === 'auto' ? 'default' : 'secondary'}>
                      {selectedMatchDetails.match.match_type === 'auto' ? 'Auto-dopasowanie' : 'Dopasowanie ręczne'}
                    </Badge>
                    <span className={`font-medium ${getMatchQuality(selectedMatchDetails.match.confidence_score).color}`}>
                      Zgodność: {Math.round(selectedMatchDetails.match.confidence_score * 100)}%
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {selectedMatchDetails.match.matched_at && formatDate(selectedMatchDetails.match.matched_at)}
                  </span>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  {/* Invoice details */}
                  <div className="rounded-lg border p-4">
                    <div className="mb-4 flex items-center gap-2">
                      <FileText className="h-5 w-5 text-blue-600" />
                      <h3 className="font-semibold">Faktura</h3>
                    </div>

                    {selectedMatchDetails.invoice ? (
                      <div className="space-y-3">
                        <div className="flex items-start gap-2">
                          <Hash className="mt-0.5 h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="text-xs text-muted-foreground">Numer faktury</div>
                            <div className="font-mono font-medium">{selectedMatchDetails.invoice.invoice_number}</div>
                          </div>
                        </div>

                        <div className="flex items-start gap-2">
                          <Building2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="text-xs text-muted-foreground">Nabywca</div>
                            <div className="font-medium">{selectedMatchDetails.invoice.buyer_name}</div>
                            {selectedMatchDetails.invoice.buyer_nip && (
                              <div className="text-sm text-muted-foreground">NIP: {selectedMatchDetails.invoice.buyer_nip}</div>
                            )}
                          </div>
                        </div>

                        <Separator />

                        <div className="flex items-start gap-2">
                          <Banknote className="mt-0.5 h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="text-xs text-muted-foreground">Kwota brutto</div>
                            <div className="text-lg font-bold">
                              {formatCurrency(selectedMatchDetails.invoice.gross_amount, selectedMatchDetails.invoice.currency)}
                            </div>
                          </div>
                        </div>

                        {selectedMatchDetails.invoice.net_amount && (
                          <div className="flex items-start gap-2">
                            <div className="w-4" />
                            <div>
                              <div className="text-xs text-muted-foreground">Kwota netto</div>
                              <div className="font-medium">
                                {formatCurrency(selectedMatchDetails.invoice.net_amount, selectedMatchDetails.invoice.currency)}
                              </div>
                            </div>
                          </div>
                        )}

                        <Separator />

                        <div className="flex items-start gap-2">
                          <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="text-xs text-muted-foreground">Data wystawienia</div>
                            <div>{formatDate(selectedMatchDetails.invoice.issue_date)}</div>
                          </div>
                        </div>

                        <div className="flex items-start gap-2">
                          <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="text-xs text-muted-foreground">Termin płatności</div>
                            <div>{formatDate(selectedMatchDetails.invoice.due_date)}</div>
                          </div>
                        </div>

                        <div className="flex items-start gap-2">
                          <Info className="mt-0.5 h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="text-xs text-muted-foreground">Status</div>
                            <Badge variant={selectedMatchDetails.invoice.payment_status === 'paid' ? 'default' : 'secondary'}>
                              {selectedMatchDetails.invoice.payment_status === 'paid' ? 'Opłacona' :
                               selectedMatchDetails.invoice.payment_status === 'overdue' ? 'Po terminie' : 'Oczekuje'}
                            </Badge>
                          </div>
                        </div>

                        <div className="pt-2">
                          <button
                            onClick={() => copyToClipboard(selectedMatchDetails.invoice!.id)}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            ID: {selectedMatchDetails.invoice.id.slice(0, 12)}... <Copy className="inline h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-muted-foreground">Brak danych faktury</div>
                    )}
                  </div>

                  {/* Payment details */}
                  <div className="rounded-lg border p-4">
                    <div className="mb-4 flex items-center gap-2">
                      <CreditCard className="h-5 w-5 text-green-600" />
                      <h3 className="font-semibold">Płatność</h3>
                    </div>

                    {selectedMatchDetails.payment ? (
                      <div className="space-y-3">
                        <div className="flex items-start gap-2">
                          <User className="mt-0.5 h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="text-xs text-muted-foreground">Nadawca</div>
                            <div className="font-medium">{selectedMatchDetails.payment.sender_name}</div>
                          </div>
                        </div>

                        {selectedMatchDetails.payment.sender_account && (
                          <div className="flex items-start gap-2">
                            <Hash className="mt-0.5 h-4 w-4 text-muted-foreground" />
                            <div>
                              <div className="text-xs text-muted-foreground">Numer konta</div>
                              <div className="font-mono text-sm">{selectedMatchDetails.payment.sender_account}</div>
                            </div>
                          </div>
                        )}

                        <Separator />

                        <div className="flex items-start gap-2">
                          <Banknote className="mt-0.5 h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="text-xs text-muted-foreground">Kwota</div>
                            <div className="text-lg font-bold text-green-600">
                              +{formatCurrency(selectedMatchDetails.payment.amount, selectedMatchDetails.payment.currency)}
                            </div>
                          </div>
                        </div>

                        <Separator />

                        <div className="flex items-start gap-2">
                          <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="text-xs text-muted-foreground">Data transakcji</div>
                            <div>{formatDate(selectedMatchDetails.payment.transaction_date)}</div>
                          </div>
                        </div>

                        <div className="flex items-start gap-2">
                          <FileText className="mt-0.5 h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="text-xs text-muted-foreground">Tytuł przelewu</div>
                            <div className="text-sm break-words">{selectedMatchDetails.payment.title}</div>
                          </div>
                        </div>

                        {selectedMatchDetails.payment.reference && (
                          <div className="flex items-start gap-2">
                            <Info className="mt-0.5 h-4 w-4 text-muted-foreground" />
                            <div>
                              <div className="text-xs text-muted-foreground">Referencja</div>
                              <div className="font-mono text-sm">{selectedMatchDetails.payment.reference}</div>
                            </div>
                          </div>
                        )}

                        <div className="pt-2">
                          <button
                            onClick={() => copyToClipboard(selectedMatchDetails.payment!.id)}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            ID: {selectedMatchDetails.payment.id.slice(0, 12)}... <Copy className="inline h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-muted-foreground">Brak danych płatności</div>
                    )}
                  </div>
                </div>

                {/* Comparison summary */}
                {selectedMatchDetails.invoice && selectedMatchDetails.payment && (
                  <div className="rounded-lg bg-muted/30 p-4">
                    <h4 className="mb-3 font-medium">Porównanie kwot</h4>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <div className="text-sm text-muted-foreground">Faktura (brutto)</div>
                        <div className="text-lg font-semibold">
                          {formatCurrency(selectedMatchDetails.invoice.gross_amount, selectedMatchDetails.invoice.currency)}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Płatność</div>
                        <div className="text-lg font-semibold text-green-600">
                          {formatCurrency(selectedMatchDetails.payment.amount, selectedMatchDetails.payment.currency)}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Różnica</div>
                        {(() => {
                          const diff = selectedMatchDetails.payment.amount - selectedMatchDetails.invoice.gross_amount
                          const isExact = Math.abs(diff) < 0.01
                          return (
                            <div className={`text-lg font-semibold ${isExact ? 'text-green-600' : diff > 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                              {isExact ? '✓ Dokładne' : (diff > 0 ? '+' : '') + formatCurrency(diff, selectedMatchDetails.invoice.currency)}
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedMatchDetails(null)}
                  >
                    Zamknij
                  </Button>
                  {isFakturowniaConfigured && selectedMatchDetails.invoice?.fakturownia_id && (
                    sendingToFakturowniaIds.has(selectedMatchDetails.invoice.id) ? (
                      <Button variant="outline" disabled>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Aktualizuję...
                      </Button>
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            disabled={isFakturowniaLoading}
                            className={
                              selectedMatchDetails.invoice.fakturownia_status === 'paid'
                                ? 'border-green-300 bg-green-50 text-green-800 hover:bg-green-100 dark:border-green-700 dark:bg-green-900/30 dark:text-green-400'
                                : selectedMatchDetails.invoice.fakturownia_status === 'issued'
                                ? 'border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                : 'border-gray-300 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400'
                            }
                          >
                            {selectedMatchDetails.invoice.fakturownia_status === 'paid' ? (
                              <>
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                Opłacona
                              </>
                            ) : selectedMatchDetails.invoice.fakturownia_status === 'issued' ? (
                              <>
                                <FileText className="mr-2 h-4 w-4" />
                                Wystawiona
                              </>
                            ) : (
                              <>
                                <Info className="mr-2 h-4 w-4" />
                                Zmień status
                              </>
                            )}
                            <ChevronDown className="ml-2 h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleChangeStatusInFakturownia(
                              selectedMatchDetails.invoice!.id,
                              selectedMatchDetails.invoice!.fakturownia_id,
                              'paid'
                            )}
                            className={selectedMatchDetails.invoice.fakturownia_status === 'paid' ? 'bg-green-50 dark:bg-green-900/20' : ''}
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                            Opłacona
                            {selectedMatchDetails.invoice.fakturownia_status === 'paid' && (
                              <Check className="ml-auto h-4 w-4 text-green-600" />
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleChangeStatusInFakturownia(
                              selectedMatchDetails.invoice!.id,
                              selectedMatchDetails.invoice!.fakturownia_id,
                              'issued'
                            )}
                            className={selectedMatchDetails.invoice.fakturownia_status === 'issued' ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                          >
                            <FileText className="mr-2 h-4 w-4 text-blue-600" />
                            Wystawiona
                            {selectedMatchDetails.invoice.fakturownia_status === 'issued' && (
                              <Check className="ml-auto h-4 w-4 text-blue-600" />
                            )}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )
                  )}
                  <Button
                    variant="destructive"
                    onClick={() => {
                      removeMatch(selectedMatchDetails.match.id)
                      setSelectedMatchDetails(null)
                    }}
                    disabled={isProcessing}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Usuń dopasowanie
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </PageContainer>
  )
}

// Helper components
interface MatchSuggestionCardProps {
  match: {
    invoiceId: string
    paymentId: string
    confidence: number
    reasons: string[]
  }
  onConfirm: () => void
  onReject: () => void
  isProcessing: boolean
}

function MatchSuggestionCard({
  match,
  onConfirm,
  onReject,
  isProcessing,
}: MatchSuggestionCardProps): React.JSX.Element {
  const quality = getMatchQuality(match.confidence)

  return (
    <div className="flex items-center justify-between rounded-lg border bg-green-50 p-4 dark:bg-green-950/20">
      <div className="flex items-center gap-4">
        <div className="text-sm">
          <span className="font-mono">{match.invoiceId.slice(0, 8)}...</span>
          <ArrowRight className="mx-2 inline h-4 w-4" />
          <span className="font-mono">{match.paymentId.slice(0, 8)}...</span>
        </div>
        <span className={`text-sm font-medium ${quality.color}`}>
          {Math.round(match.confidence * 100)}% - {quality.label}
        </span>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onReject}
          disabled={isProcessing}
        >
          <X className="mr-1 h-4 w-4" />
          Odrzuć
        </Button>
        <Button size="sm" onClick={onConfirm} disabled={isProcessing}>
          <Check className="mr-1 h-4 w-4" />
          Potwierdź
        </Button>
      </div>
    </div>
  )
}

interface SuggestionCardProps {
  suggestion: {
    invoice: { id: string; invoice_number: string; buyer_name: string; gross_amount: number; currency: string }
    payment: { id: string; sender_name: string; amount: number; title: string }
    confidence: number
    reasons: string[]
  }
  onConfirm: () => void
  onReject: () => void
  isProcessing: boolean
}

function SuggestionCard({
  suggestion,
  onConfirm,
  onReject,
  isProcessing,
}: SuggestionCardProps): React.JSX.Element {
  const quality = getMatchQuality(suggestion.confidence)

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{suggestion.invoice.invoice_number}</span>
                <ShortId id={suggestion.invoice.id} prefix="F:" />
              </div>
              <div className="text-xs text-muted-foreground">{suggestion.invoice.buyer_name}</div>
              <div className="text-sm font-medium">
                {formatCurrency(suggestion.invoice.gross_amount, suggestion.invoice.currency)}
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{suggestion.payment.sender_name}</span>
                <ShortId id={suggestion.payment.id} prefix="P:" />
              </div>
              <div className="max-w-[200px] truncate text-xs text-muted-foreground">
                {suggestion.payment.title}
              </div>
              <div className="text-sm font-medium text-green-600">
                +{formatCurrency(suggestion.payment.amount, 'PLN')}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {suggestion.reasons.map((reason, i) => (
              <span
                key={i}
                className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                {reason}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`text-sm font-medium ${quality.color}`}>
            {Math.round(suggestion.confidence * 100)}%
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onReject}
              disabled={isProcessing}
            >
              <X className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={onConfirm} disabled={isProcessing}>
              <Check className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Group suggestion card - multiple invoices matched to one payment
interface GroupSuggestionCardProps {
  suggestion: GroupMatchSuggestion
  onConfirm: () => void
  onReject: () => void
  isProcessing: boolean
}

function GroupSuggestionCard({
  suggestion,
  onConfirm,
  onReject,
  isProcessing,
}: GroupSuggestionCardProps): React.JSX.Element {
  const quality = getMatchQuality(suggestion.confidence)
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 dark:border-purple-800 dark:bg-purple-950/20">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-3">
          {/* Header with buyer info */}
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-purple-100 p-2 dark:bg-purple-900">
              <Link2 className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <div className="font-medium">{suggestion.buyerName}</div>
              {suggestion.buyerNip && (
                <div className="text-xs text-muted-foreground">NIP: {suggestion.buyerNip}</div>
              )}
              {suggestion.groupPeriod && (
                <div className="text-xs text-muted-foreground">
                  Okres: {suggestion.groupPeriod.from}
                  {suggestion.groupPeriod.from !== suggestion.groupPeriod.to &&
                    ` – ${suggestion.groupPeriod.to}`}
                </div>
              )}
            </div>
          </div>

          {/* Summary row */}
          <div className="flex items-center gap-4 rounded-md bg-white/50 p-3 dark:bg-black/20">
            <div className="flex-1">
              <div className="text-sm text-muted-foreground">
                {suggestion.invoices.length} faktur
              </div>
              <div className="text-lg font-semibold">
                {formatCurrency(suggestion.totalInvoiceAmount, suggestion.invoices[0]?.currency || 'PLN')}
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1 text-right">
              <div className="text-sm text-muted-foreground">Płatność</div>
              <div className="text-lg font-semibold text-green-600">
                {formatCurrency(suggestion.payment.amount, suggestion.payment.currency)}
              </div>
            </div>
          </div>

          {/* Invoices list - collapsible */}
          <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between">
                <span>Faktury ({suggestion.invoices.length})</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-1">
              {suggestion.invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between rounded bg-white/50 px-3 py-2 text-sm dark:bg-black/20"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{invoice.invoice_number}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(invoice.issue_date)}
                    </span>
                  </div>
                  <span className="font-medium">
                    {formatCurrency(invoice.gross_amount, invoice.currency)}
                  </span>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>

          {/* Payment info */}
          <div className="text-sm">
            <div className="text-muted-foreground">Płatność:</div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{suggestion.payment.sender_name}</span>
              <ShortId id={suggestion.payment.id} prefix="P:" />
            </div>
            <div className="max-w-[400px] truncate text-xs text-muted-foreground">
              {suggestion.payment.title}
            </div>
          </div>

          {/* Reasons */}
          <div className="flex flex-wrap gap-1">
            {suggestion.reasons.map((reason, i) => (
              <span
                key={i}
                className="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-700 dark:bg-purple-900 dark:text-purple-300"
              >
                {reason}
              </span>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="ml-4 flex flex-col items-end gap-2">
          <span className={`text-sm font-medium ${quality.color}`}>
            {Math.round(suggestion.confidence * 100)}%
          </span>
          <div className="flex flex-col gap-2">
            <Button size="sm" onClick={onConfirm} disabled={isProcessing}>
              <Check className="mr-1 h-4 w-4" />
              Dopasuj wszystkie
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onReject}
              disabled={isProcessing}
            >
              <X className="mr-1 h-4 w-4" />
              Odrzuć
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
