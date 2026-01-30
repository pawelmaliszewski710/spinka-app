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
import { Link } from 'react-router-dom'
import {
  FileUp,
  FileText,
  CreditCard,
  Link2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  RefreshCw,
  Loader2,
  ArrowRight,
} from 'lucide-react'
import { useDashboard } from '@/hooks/useDashboard'
import { formatCurrency } from '@/lib/utils'
import { NumberTicker } from '@/components/ui/number-ticker'
import { BlurFade } from '@/components/ui/blur-fade'
import { BorderBeam } from '@/components/ui/border-beam'
import { ShimmerButton } from '@/components/ui/shimmer-button'
import { ShineBorder } from '@/components/ui/shine-border'

export function DashboardPage(): React.JSX.Element {
  const {
    stats,
    recentInvoices,
    overdueInvoices,
    isLoading,
    refresh,
  } = useDashboard()

  // Show onboarding if no data
  const isEmpty = !stats || (stats.invoices.total === 0 && stats.payments.total === 0)

  if (isLoading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </PageContainer>
    )
  }

  if (isEmpty) {
    return (
      <PageContainer>
        <div className="flex flex-col items-center justify-center py-12">
          <BlurFade delay={0.1}>
            <div className="text-center">
              <img src="/spinka-logo.png" alt="Spinka" className="mx-auto h-16 w-auto" />
              <h1 className="mt-4 text-2xl font-bold">Witaj w Spinka!</h1>
              <p className="mt-2 text-muted-foreground">
                Rozpocznij od importu faktur, aby móc dopasowywać je do płatności.
              </p>
            </div>
          </BlurFade>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <BlurFade delay={0.2}>
              <Card className="relative cursor-pointer overflow-hidden transition-shadow hover:shadow-md">
                <BorderBeam size={120} duration={8} />
                <CardHeader>
                  <FileUp className="h-8 w-8 text-primary" />
                  <CardTitle className="mt-2">1. Importuj faktury</CardTitle>
                  <CardDescription>
                    Wgraj plik CSV z Fakturownia.pl z listą faktur
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Link to="/invoices">
                    <ShimmerButton className="w-full">
                      Importuj faktury
                    </ShimmerButton>
                  </Link>
                </CardContent>
              </Card>
            </BlurFade>

            <BlurFade delay={0.3}>
              <Card className="cursor-pointer transition-shadow hover:shadow-md">
                <CardHeader>
                  <CreditCard className="h-8 w-8 text-primary" />
                  <CardTitle className="mt-2">2. Importuj płatności</CardTitle>
                  <CardDescription>
                    Wgraj wyciąg bankowy (MT940, mBank CSV, ING CSV)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Link to="/payments">
                    <Button variant="outline" className="w-full">
                      Importuj płatności
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </BlurFade>

            <BlurFade delay={0.4}>
              <Card className="cursor-pointer transition-shadow hover:shadow-md">
                <CardHeader>
                  <Link2 className="h-8 w-8 text-primary" />
                  <CardTitle className="mt-2">3. Dopasuj</CardTitle>
                  <CardDescription>
                    System automatycznie połączy faktury z płatnościami
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Link to="/matching">
                    <Button variant="outline" className="w-full">
                      Zobacz dopasowania
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </BlurFade>
          </div>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <div className="space-y-6">
        {/* Header */}
        <BlurFade delay={0.1}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Dashboard</h1>
              <p className="text-muted-foreground">Przegląd faktur i płatności</p>
            </div>
            <Button variant="outline" size="sm" onClick={refresh}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Odśwież
            </Button>
          </div>
        </BlurFade>

        {/* Overdue alert */}
        {overdueInvoices.length > 0 && (
          <BlurFade delay={0.15}>
            <ShineBorder
              className="w-full"
              color={["#ef4444", "#f97316", "#eab308"]}
              borderRadius={12}
              borderWidth={2}
            >
              <Card className="border-0 bg-destructive/5">
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    <div>
                      <p className="font-medium text-destructive">
                        <NumberTicker value={overdueInvoices.length} className="text-destructive" /> {overdueInvoices.length === 1 ? 'faktura po terminie' : 'faktur po terminie'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Na łączną kwotę {formatCurrency(
                          overdueInvoices.reduce((sum, i) => sum + i.gross_amount, 0),
                          'PLN'
                        )}
                      </p>
                    </div>
                  </div>
                  <Link to="/overdue">
                    <Button variant="destructive" size="sm">
                      Zobacz zaległości
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </ShineBorder>
          </BlurFade>
        )}

        {/* Stats grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Total invoices */}
          <BlurFade delay={0.2}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Wszystkie faktury
                </CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  <NumberTicker value={stats.invoices.total} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(stats.amounts.totalGross, 'PLN')} łącznie
                </p>
              </CardContent>
            </Card>
          </BlurFade>

          {/* Paid */}
          <BlurFade delay={0.25}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Opłacone
                </CardTitle>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  <NumberTicker value={stats.invoices.paid} className="text-green-600" />
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(stats.amounts.paid, 'PLN')}
                </p>
              </CardContent>
            </Card>
          </BlurFade>

          {/* Pending */}
          <BlurFade delay={0.3}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Oczekujące
                </CardTitle>
                <Clock className="h-4 w-4 text-yellow-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">
                  <NumberTicker value={stats.invoices.pending} className="text-yellow-600" />
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(stats.amounts.pending, 'PLN')}
                </p>
              </CardContent>
            </Card>
          </BlurFade>

          {/* Overdue */}
          <BlurFade delay={0.35}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Zaległe
                </CardTitle>
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  <NumberTicker value={stats.invoices.overdue} className="text-red-600" />
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(stats.amounts.overdue, 'PLN')}
                </p>
              </CardContent>
            </Card>
          </BlurFade>
        </div>

        {/* Secondary stats */}
        <div className="grid gap-4 md:grid-cols-3">
          {/* Payments */}
          <BlurFade delay={0.4}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Płatności
                </CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  <NumberTicker value={stats.payments.total} />
                </div>
                <div className="mt-2 flex gap-4 text-xs">
                  <span className="text-green-600">
                    {stats.payments.matched} dopasowanych
                  </span>
                  <span className="text-yellow-600">
                    {stats.payments.unmatched} niedopasowanych
                  </span>
                </div>
              </CardContent>
            </Card>
          </BlurFade>

          {/* Matches */}
          <BlurFade delay={0.45}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Dopasowania
                </CardTitle>
                <Link2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  <NumberTicker value={stats.matches.total} />
                </div>
                <div className="mt-2 flex gap-4 text-xs">
                  <span className="text-blue-600">{stats.matches.auto} automatycznych</span>
                  <span className="text-purple-600">{stats.matches.manual} ręcznych</span>
                </div>
              </CardContent>
            </Card>
          </BlurFade>

          {/* Payment rate */}
          <BlurFade delay={0.5}>
            <Card className="relative overflow-hidden">
              <BorderBeam size={80} duration={12} colorFrom="#22c55e" colorTo="#3b82f6" />
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Wskaźnik opłacalności
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  <NumberTicker
                    value={stats.invoices.total > 0
                      ? Math.round((stats.invoices.paid / stats.invoices.total) * 100)
                      : 0}
                  />%
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {stats.invoices.paid} z {stats.invoices.total} faktur opłaconych
                </p>
              </CardContent>
            </Card>
          </BlurFade>
        </div>

        {/* Recent invoices and quick actions */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Recent invoices */}
          <BlurFade delay={0.55}>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Ostatnie faktury</CardTitle>
                  <Link to="/invoices">
                    <Button variant="ghost" size="sm">
                      Zobacz wszystkie
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {recentInvoices.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    Brak faktur
                  </p>
                ) : (
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nr faktury</TableHead>
                          <TableHead className="text-right">Kwota</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentInvoices.map((invoice, index) => (
                          <BlurFade key={invoice.id} delay={0.6 + index * 0.05} inView>
                            <TableRow>
                              <TableCell className="font-mono text-xs">
                                {invoice.invoice_number}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(invoice.gross_amount, invoice.currency)}
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={invoice.payment_status} />
                              </TableCell>
                            </TableRow>
                          </BlurFade>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </BlurFade>

          {/* Quick actions */}
          <BlurFade delay={0.6}>
            <Card>
              <CardHeader>
                <CardTitle>Szybkie akcje</CardTitle>
                <CardDescription>Często używane funkcje</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Link to="/invoices" className="block">
                  <Button variant="outline" className="w-full justify-start">
                    <FileUp className="mr-2 h-4 w-4" />
                    Importuj faktury
                  </Button>
                </Link>
                <Link to="/payments" className="block">
                  <Button variant="outline" className="w-full justify-start">
                    <CreditCard className="mr-2 h-4 w-4" />
                    Importuj wyciąg bankowy
                  </Button>
                </Link>
                <Link to="/matching" className="block">
                  <Button variant="outline" className="w-full justify-start">
                    <Link2 className="mr-2 h-4 w-4" />
                    Dopasuj faktury do płatności
                  </Button>
                </Link>
                {overdueInvoices.length > 0 && (
                  <Link to="/overdue" className="block">
                    <Button variant="destructive" className="w-full justify-start">
                      <AlertTriangle className="mr-2 h-4 w-4" />
                      Zobacz {overdueInvoices.length} zaległych faktur
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          </BlurFade>
        </div>
      </div>
    </PageContainer>
  )
}

// Helper component
function StatusBadge({ status }: { status: string }): React.JSX.Element {
  const styles: Record<string, { label: string; className: string }> = {
    pending: {
      label: 'Oczekuje',
      className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    },
    paid: {
      label: 'Opłacona',
      className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    },
    overdue: {
      label: 'Zaległa',
      className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    },
    partial: {
      label: 'Częściowa',
      className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    },
  }

  const style = styles[status] || styles.pending

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${style.className}`}>
      {style.label}
    </span>
  )
}
