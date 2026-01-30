import { useState, useEffect } from 'react'
import { Cloud, CheckCircle2, AlertTriangle, Loader2, RefreshCw, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { useFakturowniaImport } from '@/hooks/useFakturowniaImport'
import { useFakturowniaSettings } from '@/hooks/useFakturowniaSettings'
import type { MappedInvoice } from '@/hooks/useFakturowniaImport'

// Available kinds and statuses
const INVOICE_KINDS = [
  { value: 'vat', label: 'VAT (faktury)' },
  { value: 'proforma', label: 'Proforma' },
  { value: 'canceled', label: 'Anulowane' },
  { value: 'correction', label: 'Korekty' },
]

const INVOICE_STATUSES = [
  { value: 'issued', label: 'Wystawiona' },
  { value: 'sent', label: 'Wysłana' },
  { value: 'paid', label: 'Opłacona' },
  { value: 'partial', label: 'Częściowo opłacona' },
]

export function FakturowniaApiImport(): React.JSX.Element {
  const {
    isConfigured,
    isCheckingConfig,
    progress,
    preview,
    result,
    fetchPreview,
    executeImport,
    reset,
  } = useFakturowniaImport()

  // Persystencja ustawień filtrów
  const { settings, updateSettings, resetSettings, hasStoredSettings } = useFakturowniaSettings()

  // Lokalny stan filtrów (synchronizowany z persystencją)
  const [dateFrom, setDateFrom] = useState(settings.dateFrom)
  const [dateTo, setDateTo] = useState(settings.dateTo)
  const [selectedKinds, setSelectedKinds] = useState<string[]>(settings.kinds)
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(settings.statuses)
  const [prefixFilter, setPrefixFilter] = useState(settings.prefixFilter)

  // Synchronizuj zmiany z persystencją
  useEffect(() => {
    updateSettings({
      dateFrom,
      dateTo,
      kinds: selectedKinds,
      statuses: selectedStatuses,
      prefixFilter,
    })
  }, [dateFrom, dateTo, selectedKinds, selectedStatuses, prefixFilter, updateSettings])

  const handleKindToggle = (kind: string) => {
    setSelectedKinds((prev) =>
      prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]
    )
  }

  const handleStatusToggle = (status: string) => {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    )
  }

  const handleFetchPreview = async () => {
    await fetchPreview({
      dateFrom,
      dateTo,
      kinds: selectedKinds,
      statuses: selectedStatuses,
      prefixFilter: prefixFilter.trim() || null,
    })
  }

  const handleReset = () => {
    reset()
  }

  const handleResetFilters = () => {
    resetSettings()
    // Zaktualizuj lokalny stan po resecie
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    setDateFrom(firstDay.toISOString().split('T')[0])
    setDateTo(lastDay.toISOString().split('T')[0])
    setSelectedKinds(['vat', 'proforma', 'canceled', 'correction'])
    setSelectedStatuses(['issued', 'sent', 'paid', 'partial'])
    setPrefixFilter('')
  }

  // Loading configuration check
  if (isCheckingConfig) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            Import z API Fakturownia
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Sprawdzanie konfiguracji API...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Not configured state
  if (!isConfigured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            Import z API Fakturownia
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>API nie skonfigurowane</AlertTitle>
            <AlertDescription>
              Fakturownia API nie jest skonfigurowane na serwerze.
              Skontaktuj się z administratorem, aby dodać klucz API do Supabase secrets.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  // Show results after import
  if (result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            Import z API Fakturownia
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center py-8">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <h3 className="mt-4 text-xl font-semibold">Import zakończony</h3>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border bg-green-50 p-4 dark:bg-green-950/20">
                <p className="text-2xl font-bold text-green-600">{result.imported}</p>
                <p className="text-sm text-green-600/80">Nowych faktur</p>
              </div>
              <div className="rounded-lg border bg-blue-50 p-4 dark:bg-blue-950/20">
                <p className="text-2xl font-bold text-blue-600">{result.updated}</p>
                <p className="text-sm text-blue-600/80">Zaktualizowanych</p>
              </div>
              <div className="rounded-lg border bg-gray-50 p-4 dark:bg-gray-950/20">
                <p className="text-2xl font-bold text-gray-600">{result.skipped}</p>
                <p className="text-sm text-gray-600/80">Pominiętych</p>
              </div>
            </div>

            {result.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Błędy ({result.errors.length})</AlertTitle>
                <AlertDescription>
                  <ul className="mt-2 list-inside list-disc text-sm">
                    {result.errors.slice(0, 5).map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                    {result.errors.length > 5 && (
                      <li className="text-muted-foreground">...i {result.errors.length - 5} więcej</li>
                    )}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-center pt-4">
              <Button onClick={handleReset}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Importuj ponownie
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Show preview if available
  if (preview.length > 0 && progress?.phase === 'complete') {
    const newCount = preview.filter((m) => m.action === 'new').length
    const updateCount = preview.filter((m) => m.action === 'update').length
    const skipCount = preview.filter((m) => m.action === 'skip').length

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            Import z API Fakturownia
          </CardTitle>
          <CardDescription>
            Podgląd faktur do importu
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Summary */}
            <div className="flex items-center gap-4 rounded-lg bg-muted/50 p-3">
              <Badge variant="outline" className="bg-green-100 text-green-700">
                {newCount} nowych
              </Badge>
              <Badge variant="outline" className="bg-blue-100 text-blue-700">
                {updateCount} do aktualizacji
              </Badge>
              <Badge variant="outline" className="bg-gray-100 text-gray-700">
                {skipCount} bez zmian
              </Badge>
              <div className="flex-1" />
              <Button variant="ghost" size="sm" onClick={handleReset}>
                Zmień filtry
              </Button>
            </div>

            {/* Preview table */}
            <div className="max-h-80 overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">Nr faktury</th>
                    <th className="px-3 py-2 text-left">Nabywca</th>
                    <th className="px-3 py-2 text-right">Kwota</th>
                    <th className="px-3 py-2 text-left">Rodzaj</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Akcja</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 50).map((item, i) => (
                    <PreviewRow key={i} item={item} />
                  ))}
                </tbody>
              </table>
              {preview.length > 50 && (
                <div className="border-t bg-muted/50 p-2 text-center text-sm text-muted-foreground">
                  ...i {preview.length - 50} więcej faktur
                </div>
              )}
            </div>

            {/* Import button - prominent CTA */}
            <div className="rounded-xl border-2 border-green-500 bg-green-50 p-4 dark:bg-green-950/20">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-lg font-semibold text-green-800 dark:text-green-300">
                    ✓ Gotowe do importu: {newCount + updateCount} faktur
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {skipCount} faktur zostanie pominiętych (bez zmian)
                  </p>
                  <p className="mt-1 text-sm text-green-600 dark:text-green-400">
                    Kliknij przycisk aby zatwierdzić import →
                  </p>
                </div>
                <Button
                  onClick={executeImport}
                  disabled={newCount + updateCount === 0}
                  size="lg"
                  className="min-w-[180px] bg-green-600 text-base font-semibold shadow-lg transition-all hover:bg-green-700 hover:shadow-xl"
                >
                  <Cloud className="mr-2 h-5 w-5" />
                  Importuj faktury
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Show progress
  if (progress && progress.phase !== 'idle' && progress.phase !== 'complete') {
    const progressPercent = progress.total > 0 ? (progress.current / progress.total) * 100 : 0

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            Import z API Fakturownia
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-lg font-medium">{progress.message}</p>
            {progress.phase === 'syncing' && (
              <div className="mt-4 w-full max-w-xs">
                <Progress value={progressPercent} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  // Filter form (initial state)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cloud className="h-5 w-5" />
          Import z API Fakturownia
        </CardTitle>
        <CardDescription>
          Pobierz faktury bezpośrednio z API Fakturownia.pl
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Date range */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="date-from">Data od</Label>
              <Input
                id="date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date-to">Data do</Label>
              <Input
                id="date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          {/* Invoice kinds */}
          <div className="space-y-2">
            <Label>Rodzaj dokumentu</Label>
            <div className="flex flex-wrap gap-4">
              {INVOICE_KINDS.map((kind) => (
                <div key={kind.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`kind-${kind.value}`}
                    checked={selectedKinds.includes(kind.value)}
                    onCheckedChange={() => handleKindToggle(kind.value)}
                  />
                  <label
                    htmlFor={`kind-${kind.value}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {kind.label}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Invoice statuses */}
          <div className="space-y-2">
            <Label>Status płatności</Label>
            <div className="flex flex-wrap gap-4">
              {INVOICE_STATUSES.map((status) => (
                <div key={status.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`status-${status.value}`}
                    checked={selectedStatuses.includes(status.value)}
                    onCheckedChange={() => handleStatusToggle(status.value)}
                  />
                  <label
                    htmlFor={`status-${status.value}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {status.label}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Prefix filter */}
          <div className="space-y-2">
            <Label htmlFor="prefix">Prefiks numeru faktury (opcjonalnie)</Label>
            <Input
              id="prefix"
              placeholder="np. PS, FV (pozostaw puste dla wszystkich)"
              value={prefixFilter}
              onChange={(e) => setPrefixFilter(e.target.value)}
              className="max-w-xs"
            />
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {hasStoredSettings && (
                <Button variant="ghost" size="sm" onClick={handleResetFilters}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Resetuj filtry
                </Button>
              )}
              {hasStoredSettings && (
                <span className="text-xs text-muted-foreground">
                  Filtry są zapamiętywane
                </span>
              )}
            </div>
            <Button onClick={handleFetchPreview} disabled={selectedKinds.length === 0 || selectedStatuses.length === 0}>
              Pobierz podgląd
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Preview row component
function PreviewRow({ item }: { item: MappedInvoice }) {
  const actionBadge = {
    new: <Badge className="bg-green-100 text-green-700">Nowy</Badge>,
    update: <Badge className="bg-blue-100 text-blue-700">Aktualizacja</Badge>,
    skip: <Badge variant="outline" className="text-gray-500">Bez zmian</Badge>,
  }

  return (
    <tr className="border-t">
      <td className="px-3 py-2 font-mono text-xs">
        {item.fakturowniaInvoice.number}
      </td>
      <td className="px-3 py-2 max-w-[200px] truncate">
        {item.fakturowniaInvoice.buyer_name}
      </td>
      <td className="px-3 py-2 text-right">
        {parseFloat(item.fakturowniaInvoice.price_gross).toFixed(2)} {item.fakturowniaInvoice.currency}
      </td>
      <td className="px-3 py-2">
        <Badge variant="outline" className="text-xs">
          {item.fakturowniaInvoice.kind}
        </Badge>
      </td>
      <td className="px-3 py-2">
        {item.statusChanged ? (
          <span className="text-xs">
            <span className="text-muted-foreground line-through">{item.existingStatus}</span>
            {' → '}
            <span className="font-medium">{item.localInvoice.payment_status}</span>
          </span>
        ) : (
          <span className="text-xs">{item.fakturowniaInvoice.status}</span>
        )}
      </td>
      <td className="px-3 py-2">{actionBadge[item.action]}</td>
    </tr>
  )
}

export default FakturowniaApiImport
