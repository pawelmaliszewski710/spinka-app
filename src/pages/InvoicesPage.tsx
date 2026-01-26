import { useState, useEffect, useCallback } from 'react'
import { PageContainer } from '@/components/layout'
import { InvoiceImport } from '@/components/import'
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
import { FileText, Search, Plus, RefreshCw, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Invoice } from '@/types'

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
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showImport, setShowImport] = useState(false)

  const fetchInvoices = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
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
  }, [])

  useEffect(() => {
    fetchInvoices()
  }, [fetchInvoices])

  const filteredInvoices = invoices.filter((invoice) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      invoice.invoice_number.toLowerCase().includes(query) ||
      invoice.buyer_name.toLowerCase().includes(query) ||
      (invoice.buyer_nip && invoice.buyer_nip.includes(query))
    )
  })

  return (
    <PageContainer>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Faktury</h1>
            <p className="text-muted-foreground">Zarządzaj fakturami przychodowymi</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchInvoices} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Odśwież
            </Button>
            <Button size="sm" onClick={() => setShowImport(!showImport)}>
              <Plus className="mr-2 h-4 w-4" />
              {showImport ? 'Ukryj import' : 'Importuj CSV'}
            </Button>
          </div>
        </div>

        {showImport && (
          <InvoiceImport />
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Lista faktur
            </CardTitle>
            <CardDescription>
              {invoices.length > 0
                ? `Łącznie ${invoices.length} faktur`
                : 'Zaimportuj faktury aby rozpocząć'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invoices.length > 0 && (
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Szukaj po numerze, nabywcy lub NIP..."
                    value={searchQuery}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : invoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 text-lg font-medium">Brak faktur</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Zaimportuj faktury z pliku CSV aby rozpocząć
                </p>
                <Button className="mt-4" onClick={() => setShowImport(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Importuj faktury
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nr faktury</TableHead>
                      <TableHead>Nabywca</TableHead>
                      <TableHead className="text-right">Kwota brutto</TableHead>
                      <TableHead>Termin płatności</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          Brak faktur pasujących do wyszukiwania
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredInvoices.map((invoice) => {
                        const status = STATUS_BADGES[invoice.payment_status] || STATUS_BADGES.pending
                        return (
                          <TableRow key={invoice.id}>
                            <TableCell className="font-mono text-sm">
                              {invoice.invoice_number}
                            </TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium">{invoice.buyer_name}</div>
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
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
}
