import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { PageContainer } from '@/components/layout'
import { InvoiceImport } from '@/components/import'
import { useCompany } from '@/contexts/CompanyContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { FileText, Search, Plus, RefreshCw, Loader2, Trash2, Copy, CheckCircle2, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Invoice } from '@/types'
import { BlurFade } from '@/components/ui/blur-fade'
import { NumberTicker } from '@/components/ui/number-ticker'
import { OnboardingTip } from '@/components/onboarding'

type PaymentStatusBadge = {
  label: string
  className: string
}

const STATUS_BADGES: Record<string, PaymentStatusBadge> = {
  pending: { label: 'Oczekuje', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  paid: { label: 'Opłacona', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  overdue: { label: 'Zaległa', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  partial: { label: 'Częściowa', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
}

export function InvoicesPage(): React.JSX.Element {
  const { currentCompany } = useCompany()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const fetchInvoices = useCallback(async () => {
    if (!currentCompany) {
      setInvoices([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('company_id', currentCompany.id)
        .order('due_date', { ascending: true })

      if (error) {
        console.error('Error fetching invoices:', error)
        return
      }

      setInvoices(data || [])
    } catch (error) {
      console.error('Error fetching invoices:', error)
    } finally {
      setLoading(false)
    }
  }, [currentCompany])

  useEffect(() => {
    fetchInvoices()
  }, [fetchInvoices])

  // Refetch when company changes
  useEffect(() => {
    if (currentCompany) {
      fetchInvoices()
    }
  }, [currentCompany?.id, fetchInvoices])

  const handleDeleteAllInvoices = async () => {
    if (!currentCompany) {
      toast.error('Wybierz firmę')
      return
    }

    setIsDeleting(true)
    try {
      // First delete all matches for this company's invoices
      const { error: matchError } = await supabase
        .from('matches')
        .delete()
        .eq('company_id', currentCompany.id)

      if (matchError) {
        console.error('Error deleting matches:', matchError)
        toast.error('Błąd podczas usuwania dopasowań')
        return
      }

      // Then delete all invoices for this company
      const { error } = await supabase
        .from('invoices')
        .delete()
        .eq('company_id', currentCompany.id)

      if (error) {
        console.error('Error deleting invoices:', error)
        toast.error('Błąd podczas usuwania faktur')
        return
      }

      toast.success('Wszystkie faktury zostały usunięte')
      setInvoices([])
    } catch (error) {
      console.error('Error deleting invoices:', error)
      toast.error('Nieoczekiwany błąd podczas usuwania')
    } finally {
      setIsDeleting(false)
    }
  }

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(fieldName)
      setTimeout(() => setCopiedField(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const filteredInvoices = invoices.filter((invoice) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      invoice.invoice_number.toLowerCase().includes(query) ||
      invoice.buyer_name.toLowerCase().includes(query) ||
      (invoice.buyer_nip && invoice.buyer_nip.includes(query)) ||
      (invoice.seller_bank_account && invoice.seller_bank_account.includes(query))
    )
  })

  const formatBankAccount = (account: string | null): string => {
    if (!account) return '—'
    // Remove spaces and format as XX XXXX XXXX XXXX XXXX XXXX XXXX
    const clean = account.replace(/\s/g, '')
    if (clean.length === 26) {
      return `${clean.slice(0, 2)} ${clean.slice(2, 6)} ${clean.slice(6, 10)} ${clean.slice(10, 14)} ${clean.slice(14, 18)} ${clean.slice(18, 22)} ${clean.slice(22, 26)}`
    }
    return account
  }

  return (
    <PageContainer>
      <div className="space-y-4">
        <BlurFade delay={0.1}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Faktury</h1>
              <p className="text-muted-foreground">Zarządzaj fakturami przychodowymi</p>
            </div>
          <div className="flex gap-2">
            {invoices.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={isDeleting}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Usuń wszystkie
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Czy na pewno chcesz usunąć wszystkie faktury?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Ta operacja usunie {invoices.length} faktur oraz wszystkie powiązane dopasowania.
                      Tej akcji nie można cofnąć.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Anuluj</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteAllInvoices}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {isDeleting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Usuwanie...
                        </>
                      ) : (
                        'Usuń wszystkie'
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button variant="outline" size="sm" onClick={fetchInvoices} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Odśwież
            </Button>
            <Button size="sm" onClick={() => setShowImport(!showImport)}>
              <Plus className="mr-2 h-4 w-4" />
              {showImport ? 'Ukryj import' : 'Importuj'}
            </Button>
          </div>
        </div>
        </BlurFade>

        {/* Onboarding tip for new users */}
        {invoices.length === 0 && !loading && (
          <OnboardingTip
            id="invoices-intro"
            title="Zacznij od importu faktur"
            description="Aby korzystać z systemu dopasowywania płatności, najpierw zaimportuj swoje faktury."
            icon={<Upload className="h-5 w-5" />}
            variant="info"
            steps={[
              {
                title: 'Wybierz źródło faktur',
                description: 'Możesz połączyć się z Fakturownia.pl przez API lub zaimportować plik CSV/XML.',
              },
              {
                title: 'Podejrzyj dane',
                description: 'System pokaże Ci podgląd faktur przed importem.',
              },
              {
                title: 'Zatwierdź import',
                description: 'Kliknij zielony przycisk "Importuj faktury" aby dodać faktury do systemu.',
                action: 'Ważne: pamiętaj o zatwierdzeniu!',
              },
            ]}
          />
        )}

        {showImport && (
          <BlurFade delay={0.15}>
            <InvoiceImport />
          </BlurFade>
        )}

        <BlurFade delay={0.2}>
          {loading ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </CardContent>
            </Card>
          ) : invoices.length === 0 ? (
            <InvoiceImport />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Lista faktur
                </CardTitle>
                <CardDescription>
                  Łącznie <NumberTicker value={invoices.length} className="inline text-muted-foreground" /> faktur
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Szukaj po numerze, nabywcy, NIP lub koncie..."
                      value={searchQuery}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nr faktury</TableHead>
                        <TableHead>Nabywca</TableHead>
                        <TableHead className="text-right">Kwota brutto</TableHead>
                        <TableHead>Termin płatności</TableHead>
                        <TableHead>Konto sprzedawcy</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInvoices.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground">
                            Brak faktur pasujących do wyszukiwania
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredInvoices.map((invoice) => {
                          const status = STATUS_BADGES[invoice.payment_status] || STATUS_BADGES.pending
                          return (
                            <TableRow
                              key={invoice.id}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => setSelectedInvoice(invoice)}
                            >
                              <TableCell className="font-mono text-sm font-medium text-primary">
                                {invoice.invoice_number}
                              </TableCell>
                              <TableCell className="max-w-[220px]">
                                <div title={invoice.buyer_name}>
                                  <div className="truncate font-medium">{invoice.buyer_name}</div>
                                  {invoice.buyer_nip && (
                                    <div className="text-xs text-muted-foreground">
                                      NIP: {invoice.buyer_nip}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {formatCurrency(invoice.gross_amount, invoice.currency)}
                              </TableCell>
                              <TableCell>{formatDate(invoice.due_date)}</TableCell>
                              <TableCell className="font-mono text-xs">
                                {invoice.seller_bank_account ? (
                                  <span title={formatBankAccount(invoice.seller_bank_account)}>
                                    ...{invoice.seller_bank_account.replace(/\s/g, '').slice(-8)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <span
                                  className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${status.className}`}
                                >
                                  {status.label}
                                </span>
                              </TableCell>
                            </TableRow>
                          )
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </BlurFade>
      </div>

      {/* Invoice Details Dialog */}
      <Dialog open={!!selectedInvoice} onOpenChange={(open) => !open && setSelectedInvoice(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Szczegóły faktury
            </DialogTitle>
            <DialogDescription>
              {selectedInvoice?.invoice_number}
            </DialogDescription>
          </DialogHeader>

          {selectedInvoice && (
            <div className="space-y-6">
              {/* Status badge */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Status:</span>
                <span
                  className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                    STATUS_BADGES[selectedInvoice.payment_status]?.className || STATUS_BADGES.pending.className
                  }`}
                >
                  {STATUS_BADGES[selectedInvoice.payment_status]?.label || 'Oczekuje'}
                </span>
              </div>

              {/* Main info grid */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">Numer faktury</label>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-lg">{selectedInvoice.invoice_number}</span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => copyToClipboard(selectedInvoice.invoice_number, 'invoice_number')}
                    >
                      {copiedField === 'invoice_number' ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">Kwota brutto</label>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold">
                      {formatCurrency(selectedInvoice.gross_amount, selectedInvoice.currency)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => copyToClipboard(selectedInvoice.gross_amount.toFixed(2), 'gross_amount')}
                    >
                      {copiedField === 'gross_amount' ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">Kwota netto</label>
                  <span className="block">{formatCurrency(selectedInvoice.net_amount, selectedInvoice.currency)}</span>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">Waluta</label>
                  <span className="block">{selectedInvoice.currency}</span>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">Data wystawienia</label>
                  <span className="block">{formatDate(selectedInvoice.issue_date)}</span>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">Termin płatności</label>
                  <span className="block">{formatDate(selectedInvoice.due_date)}</span>
                </div>
              </div>

              {/* Buyer info */}
              <div className="rounded-lg border p-4">
                <h4 className="mb-3 font-medium">Nabywca</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{selectedInvoice.buyer_name}</span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => copyToClipboard(selectedInvoice.buyer_name, 'buyer_name')}
                    >
                      {copiedField === 'buyer_name' ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                  {selectedInvoice.buyer_nip && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">NIP:</span>
                      <span className="font-mono">{selectedInvoice.buyer_nip}</span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => copyToClipboard(selectedInvoice.buyer_nip!, 'buyer_nip')}
                      >
                        {copiedField === 'buyer_nip' ? (
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  )}
                  {selectedInvoice.buyer_subaccount && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Subkonto nabywcy:</span>
                      <span className="font-mono">{selectedInvoice.buyer_subaccount}</span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => copyToClipboard(selectedInvoice.buyer_subaccount!, 'buyer_subaccount')}
                      >
                        {copiedField === 'buyer_subaccount' ? (
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Seller bank account */}
              {selectedInvoice.seller_bank_account && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/30">
                  <h4 className="mb-2 font-medium text-green-800 dark:text-green-300">Konto bankowe sprzedawcy (do dopasowania)</h4>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-lg text-green-700 dark:text-green-400">
                      {formatBankAccount(selectedInvoice.seller_bank_account)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => copyToClipboard(selectedInvoice.seller_bank_account!.replace(/\s/g, ''), 'seller_bank_account')}
                    >
                      {copiedField === 'seller_bank_account' ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Timestamps */}
              <div className="border-t pt-4 text-xs text-muted-foreground">
                <div>Utworzono: {formatDate(selectedInvoice.created_at)}</div>
                <div>Zaktualizowano: {formatDate(selectedInvoice.updated_at)}</div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}
