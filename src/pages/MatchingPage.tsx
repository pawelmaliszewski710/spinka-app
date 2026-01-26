import { useEffect, useState } from 'react'
import { PageContainer } from '@/components/layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Link2,
  Loader2,
  RefreshCw,
  Wand2,
  Check,
  X,
  Trash2,
  ArrowRight,
} from 'lucide-react'
import { useMatching } from '@/hooks/useMatching'
import { getMatchQuality } from '@/lib/matching'
import { formatCurrency, formatDate } from '@/lib/utils'

export function MatchingPage(): React.JSX.Element {
  const {
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
    removeMatch,
    refresh,
  } = useMatching()

  const [selectedTab, setSelectedTab] = useState<'suggestions' | 'confirmed' | 'unmatched'>('suggestions')

  useEffect(() => {
    refresh()
  }, [refresh])

  const tabs = [
    {
      id: 'suggestions' as const,
      label: 'Sugestie',
      count: autoMatches.length + suggestions.length,
    },
    {
      id: 'confirmed' as const,
      label: 'Potwierdzone',
      count: confirmedMatches.length,
    },
    {
      id: 'unmatched' as const,
      label: 'Niedopasowane',
      count: unmatchedInvoices.length,
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
                {autoMatches.length + suggestions.length}
              </div>
              <p className="text-sm text-muted-foreground">Sugestie dopasowań</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-blue-600">{confirmedMatches.length}</div>
              <p className="text-sm text-muted-foreground">Potwierdzone dopasowania</p>
            </CardContent>
          </Card>
        </div>

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
            </CardTitle>
            <CardDescription>
              {selectedTab === 'suggestions' &&
                'Przejrzyj i potwierdź lub odrzuć sugerowane dopasowania'}
              {selectedTab === 'confirmed' &&
                'Lista potwierdzonych dopasowań faktur do płatności'}
              {selectedTab === 'unmatched' &&
                'Faktury oczekujące na dopasowanie do płatności'}
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
                    {autoMatches.length === 0 && suggestions.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <Link2 className="h-12 w-12 text-muted-foreground/50" />
                        <h3 className="mt-4 text-lg font-medium">Brak sugestii</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Kliknij "Auto-dopasuj" aby wyszukać dopasowania
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
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

                        {/* Suggestions - medium confidence */}
                        {suggestions.length > 0 && (
                          <div>
                            <h4 className="mb-2 text-sm font-medium text-yellow-600">
                              Potencjalne dopasowania ({suggestions.length})
                            </h4>
                            <div className="space-y-2">
                              {suggestions.map((suggestion) => (
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
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* Confirmed matches tab */}
                {selectedTab === 'confirmed' && (
                  <>
                    {confirmedMatches.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <Check className="h-12 w-12 text-muted-foreground/50" />
                        <h3 className="mt-4 text-lg font-medium">Brak potwierdzonych dopasowań</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Potwierdzone dopasowania pojawią się tutaj
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-lg border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Faktura</TableHead>
                              <TableHead>Płatność</TableHead>
                              <TableHead>Zgodność</TableHead>
                              <TableHead>Typ</TableHead>
                              <TableHead>Data</TableHead>
                              <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {confirmedMatches.map((match) => (
                              <TableRow key={match.id}>
                                <TableCell className="font-mono text-sm">
                                  {match.invoice_id.slice(0, 8)}...
                                </TableCell>
                                <TableCell className="font-mono text-sm">
                                  {match.payment_id.slice(0, 8)}...
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
                                    {match.match_type === 'auto' ? 'Automatyczne' : 'Ręczne'}
                                  </span>
                                </TableCell>
                                <TableCell>{formatDate(match.matched_at)}</TableCell>
                                <TableCell>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeMatch(match.id)}
                                    disabled={isProcessing}
                                    title="Usuń dopasowanie"
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </>
                )}

                {/* Unmatched invoices tab */}
                {selectedTab === 'unmatched' && (
                  <>
                    {unmatchedInvoices.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <Check className="h-12 w-12 text-green-500" />
                        <h3 className="mt-4 text-lg font-medium">Wszystko dopasowane!</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Wszystkie faktury zostały dopasowane do płatności
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-lg border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Nr faktury</TableHead>
                              <TableHead>Nabywca</TableHead>
                              <TableHead className="text-right">Kwota</TableHead>
                              <TableHead>Termin</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {unmatchedInvoices.map((invoice) => (
                              <TableRow key={invoice.id}>
                                <TableCell className="font-mono text-sm">
                                  {invoice.invoice_number}
                                </TableCell>
                                <TableCell>{invoice.buyer_name}</TableCell>
                                <TableCell className="text-right font-medium">
                                  {formatCurrency(invoice.gross_amount, invoice.currency)}
                                </TableCell>
                                <TableCell>{formatDate(invoice.due_date)}</TableCell>
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
              <div className="text-sm font-medium">{suggestion.invoice.invoice_number}</div>
              <div className="text-xs text-muted-foreground">{suggestion.invoice.buyer_name}</div>
              <div className="text-sm font-medium">
                {formatCurrency(suggestion.invoice.gross_amount, suggestion.invoice.currency)}
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="text-sm font-medium">{suggestion.payment.sender_name}</div>
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
