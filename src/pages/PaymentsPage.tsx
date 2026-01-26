import { useState, useEffect, useCallback } from 'react'
import { PageContainer } from '@/components/layout'
import { PaymentImport } from '@/components/import'
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
import { CreditCard, Search, Plus, RefreshCw, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Payment } from '@/types'

export function PaymentsPage(): React.JSX.Element {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showImport, setShowImport] = useState(false)

  const fetchPayments = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .order('transaction_date', { ascending: false })

      if (error) {
        console.error('Error fetching payments:', error)
        return
      }

      setPayments(data || [])
    } catch (error) {
      console.error('Error fetching payments:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPayments()
  }, [fetchPayments])

  const filteredPayments = payments.filter((payment) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      payment.sender_name.toLowerCase().includes(query) ||
      payment.title.toLowerCase().includes(query) ||
      (payment.reference && payment.reference.toLowerCase().includes(query))
    )
  })

  const totalAmount = filteredPayments.reduce((sum, p) => sum + p.amount, 0)

  return (
    <PageContainer>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Płatności</h1>
            <p className="text-muted-foreground">Zarządzaj płatnościami przychodzącymi</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchPayments} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Odśwież
            </Button>
            <Button size="sm" onClick={() => setShowImport(!showImport)}>
              <Plus className="mr-2 h-4 w-4" />
              {showImport ? 'Ukryj import' : 'Importuj wyciąg'}
            </Button>
          </div>
        </div>

        {showImport && (
          <PaymentImport />
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Lista płatności
            </CardTitle>
            <CardDescription>
              {payments.length > 0
                ? `Łącznie ${payments.length} płatności na kwotę ${formatCurrency(totalAmount, 'PLN')}`
                : 'Zaimportuj wyciąg bankowy aby rozpocząć'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {payments.length > 0 && (
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Szukaj po nadawcy, tytule lub referencji..."
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
            ) : payments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CreditCard className="h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 text-lg font-medium">Brak płatności</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Zaimportuj wyciąg bankowy aby rozpocząć
                </p>
                <Button className="mt-4" onClick={() => setShowImport(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Importuj wyciąg
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Nadawca</TableHead>
                      <TableHead>Tytuł</TableHead>
                      <TableHead className="text-right">Kwota</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPayments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          Brak płatności pasujących do wyszukiwania
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPayments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell className="whitespace-nowrap">
                            {formatDate(payment.transaction_date)}
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{payment.sender_name}</div>
                              {payment.sender_account && (
                                <div className="max-w-[200px] truncate text-xs text-muted-foreground">
                                  {payment.sender_account}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="max-w-xs truncate" title={payment.title}>
                              {payment.title}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium text-green-600">
                            +{formatCurrency(payment.amount, payment.currency)}
                          </TableCell>
                        </TableRow>
                      ))
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
