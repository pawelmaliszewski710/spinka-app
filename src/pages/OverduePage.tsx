import { PageContainer } from '@/components/layout'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  AlertTriangle,
  RefreshCw,
  Loader2,
  Download,
  Copy,
  ClipboardList,
  Calendar,
  CheckCircle2,
} from 'lucide-react'
import { useOverdue } from '@/hooks/useOverdue'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'

export function OverduePage(): React.JSX.Element {
  const {
    invoices,
    stats,
    isLoading,
    refresh,
    exportToCsv,
    copyToClipboard,
    copyAllToClipboard,
  } = useOverdue()

  const handleCopyOne = (invoice: (typeof invoices)[0]) => {
    copyToClipboard(invoice)
    toast.success('Skopiowano do schowka')
  }

  const handleCopyAll = () => {
    copyAllToClipboard()
    toast.success(`Skopiowano ${invoices.length} faktur do schowka`)
  }

  const handleExport = () => {
    exportToCsv()
    toast.success('Wyeksportowano do CSV')
  }

  if (isLoading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </PageContainer>
    )
  }

  if (invoices.length === 0) {
    return (
      <PageContainer>
        <div className="flex flex-col items-center justify-center py-12">
          <div className="text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
            <h1 className="mt-4 text-2xl font-bold">Brak zaległości!</h1>
            <p className="mt-2 text-muted-foreground">
              Wszystkie faktury są opłacone lub jeszcze nie minął termin płatności.
            </p>
          </div>
          <Button variant="outline" className="mt-6" onClick={refresh}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Sprawdź ponownie
          </Button>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Zaległości</h1>
            <p className="text-muted-foreground">
              Faktury po terminie płatności
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCopyAll}>
              <ClipboardList className="mr-2 h-4 w-4" />
              Kopiuj wszystkie
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              Eksportuj CSV
            </Button>
            <Button variant="outline" size="sm" onClick={refresh}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Odśwież
            </Button>
          </div>
        </div>

        {/* Summary stats */}
        {stats && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="border-destructive bg-destructive/5">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Suma zaległości
                </CardTitle>
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">
                  {formatCurrency(stats.totalAmount, 'PLN')}
                </div>
                <p className="text-xs text-muted-foreground">
                  {stats.totalCount} {stats.totalCount === 1 ? 'faktura' : 'faktur'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Średnie opóźnienie
                </CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats.averageDaysOverdue} dni
                </div>
                <p className="text-xs text-muted-foreground">
                  po terminie płatności
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  1-30 dni
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">
                  {stats.byAgeGroup['1-7'].count + stats.byAgeGroup['8-30'].count}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(
                    stats.byAgeGroup['1-7'].amount + stats.byAgeGroup['8-30'].amount,
                    'PLN'
                  )}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Powyżej 30 dni
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {stats.byAgeGroup['31-60'].count + stats.byAgeGroup['60+'].count}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(
                    stats.byAgeGroup['31-60'].amount + stats.byAgeGroup['60+'].amount,
                    'PLN'
                  )}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Age breakdown */}
        {stats && (
          <Card>
            <CardHeader>
              <CardTitle>Wiekowanie zaległości</CardTitle>
              <CardDescription>
                Podział faktur według czasu po terminie płatności
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                <AgeGroupCard
                  label="1-7 dni"
                  count={stats.byAgeGroup['1-7'].count}
                  amount={stats.byAgeGroup['1-7'].amount}
                  color="yellow"
                />
                <AgeGroupCard
                  label="8-30 dni"
                  count={stats.byAgeGroup['8-30'].count}
                  amount={stats.byAgeGroup['8-30'].amount}
                  color="orange"
                />
                <AgeGroupCard
                  label="31-60 dni"
                  count={stats.byAgeGroup['31-60'].count}
                  amount={stats.byAgeGroup['31-60'].amount}
                  color="red"
                />
                <AgeGroupCard
                  label="60+ dni"
                  count={stats.byAgeGroup['60+'].count}
                  amount={stats.byAgeGroup['60+'].amount}
                  color="darkred"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Invoices table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Lista faktur po terminie
            </CardTitle>
            <CardDescription>
              Kliknij ikonę kopiowania przy fakturze, aby skopiować dane do windykacji
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nr faktury</TableHead>
                    <TableHead>Nabywca</TableHead>
                    <TableHead>NIP</TableHead>
                    <TableHead className="text-right">Kwota</TableHead>
                    <TableHead>Termin</TableHead>
                    <TableHead className="text-center">Dni po terminie</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-mono text-sm">
                        {invoice.invoice_number}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {invoice.buyer_name}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {invoice.buyer_nip || '-'}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(invoice.gross_amount, invoice.currency)}
                      </TableCell>
                      <TableCell>{invoice.due_date}</TableCell>
                      <TableCell className="text-center">
                        <DaysOverdueBadge days={invoice.daysOverdue} />
                      </TableCell>
                      <TableCell>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleCopyOne(invoice)}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Kopiuj dane faktury</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
}

// Helper components
function AgeGroupCard({
  label,
  count,
  amount,
  color,
}: {
  label: string
  count: number
  amount: number
  color: 'yellow' | 'orange' | 'red' | 'darkred'
}) {
  const colorClasses = {
    yellow: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    orange: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    red: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    darkred: 'bg-red-200 text-red-900 dark:bg-red-950/50 dark:text-red-300',
  }

  return (
    <div className={`rounded-lg p-4 ${colorClasses[color]}`}>
      <div className="text-sm font-medium">{label}</div>
      <div className="mt-1 text-2xl font-bold">{count}</div>
      <div className="mt-1 text-sm opacity-80">
        {formatCurrency(amount, 'PLN')}
      </div>
    </div>
  )
}

function DaysOverdueBadge({ days }: { days: number }) {
  let className = 'inline-flex rounded-full px-2 py-0.5 text-xs font-medium '

  if (days <= 7) {
    className += 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
  } else if (days <= 30) {
    className += 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400'
  } else if (days <= 60) {
    className += 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
  } else {
    className += 'bg-red-200 text-red-900 dark:bg-red-950/50 dark:text-red-300'
  }

  return <span className={className}>{days} dni</span>
}
