import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Cloud,
  FileUp,
  ArrowLeft,
  Settings,
  ExternalLink,
  Database,
  Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { FileDropzone } from './FileDropzone'
import { FakturowniaApiImport } from './FakturowniaApiImport'
import {
  parseFakturowniaCSV,
  validateFakturowniaFile,
  parseFakturowniaXML,
  validateFakturowniaXML,
  isFakturowniaXML,
} from '@/lib/parsers'
import type { ParsedInvoice, ImportError } from '@/types'
import { supabase } from '@/lib/supabase'
import { useCompany } from '@/contexts/CompanyContext'
import { useCompanySettings } from '@/hooks/useCompanySettings'
import { cn } from '@/lib/utils'
import { BlurFade } from '@/components/ui/blur-fade'

type ImportSource = 'fakturownia' | 'file' | 'optima' | null
type ImportStep = 'select' | 'preview' | 'importing' | 'complete' | 'error'

interface FileImportResult {
  imported: number
  skipped: number
  errors: ImportError[]
}

interface SourceCardProps {
  icon: React.ReactNode
  title: string
  description: string
  badge?: string
  badgeVariant?: 'default' | 'secondary' | 'outline'
  disabled?: boolean
  onClick: () => void
}

function SourceCard({
  icon,
  title,
  description,
  badge,
  badgeVariant = 'default',
  disabled,
  onClick,
}: SourceCardProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'group relative flex flex-col items-center gap-4 rounded-xl border-2 border-dashed p-6 text-center transition-all',
        'hover:border-primary hover:bg-primary/5',
        disabled && 'cursor-not-allowed opacity-60 hover:border-border hover:bg-transparent',
        !disabled && 'cursor-pointer'
      )}
    >
      {badge && (
        <Badge
          variant={badgeVariant}
          className="absolute right-3 top-3 text-xs"
        >
          {badge}
        </Badge>
      )}
      <div
        className={cn(
          'flex h-14 w-14 items-center justify-center rounded-full transition-colors',
          'bg-muted group-hover:bg-primary/10',
          disabled && 'group-hover:bg-muted'
        )}
      >
        {icon}
      </div>
      <div className="space-y-1">
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </button>
  )
}

/**
 * Main invoice import component with source selection
 */
export function InvoiceImport(): React.JSX.Element {
  const [selectedSource, setSelectedSource] = useState<ImportSource>(null)
  const { settings, isLoading: isLoadingSettings } = useCompanySettings()

  const isFakturowniaConfigured =
    settings?.fakturownia_enabled &&
    settings?.fakturownia_subdomain &&
    settings?.fakturownia_api_token_id

  const handleSourceSelect = (source: ImportSource) => {
    setSelectedSource(source)
  }

  const handleBack = () => {
    setSelectedSource(null)
  }

  // Loading state
  if (isLoadingSettings) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  // Source selection view
  if (selectedSource === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importuj faktury
          </CardTitle>
          <CardDescription>
            Wybierz źródło, z którego chcesz zaimportować faktury
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <BlurFade delay={0.1}>
              <SourceCard
                icon={<Cloud className="h-7 w-7 text-blue-500" />}
                title="Fakturownia.pl"
                description="Import bezpośrednio z API Fakturownia"
                badge={isFakturowniaConfigured ? 'Połączono' : undefined}
                badgeVariant={isFakturowniaConfigured ? 'default' : undefined}
                onClick={() => handleSourceSelect('fakturownia')}
              />
            </BlurFade>

            <BlurFade delay={0.15}>
              <SourceCard
                icon={<FileUp className="h-7 w-7 text-green-500" />}
                title="Plik CSV / XML"
                description="Importuj z eksportu pliku Fakturownia"
                onClick={() => handleSourceSelect('file')}
              />
            </BlurFade>

            <BlurFade delay={0.2}>
              <SourceCard
                icon={<Database className="h-7 w-7 text-orange-500" />}
                title="Comarch Optima"
                description="Integracja z systemem ERP Optima"
                badge="Wkrótce"
                badgeVariant="secondary"
                disabled
                onClick={() => handleSourceSelect('optima')}
              />
            </BlurFade>
          </div>

          <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Więcej źródeł importu pojawi się wkrótce</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Fakturownia source
  if (selectedSource === 'fakturownia') {
    if (!isFakturowniaConfigured) {
      return (
        <FakturowniaNotConfigured onBack={handleBack} />
      )
    }

    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={handleBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Wybierz inne źródło
        </Button>
        <FakturowniaApiImport />
      </div>
    )
  }

  // File import source
  if (selectedSource === 'file') {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={handleBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Wybierz inne źródło
        </Button>
        <FileInvoiceImport />
      </div>
    )
  }

  // Optima (coming soon) - this is the default/fallback case
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={handleBack} className="gap-2">
        <ArrowLeft className="h-4 w-4" />
        Wybierz inne źródło
      </Button>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Database className="h-12 w-12 text-orange-500/50" />
          <h3 className="mt-4 text-lg font-semibold">Comarch Optima</h3>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Integracja z Comarch Optima jest w przygotowaniu.<br />
            Powiadomimy Cię gdy będzie dostępna.
          </p>
          <Badge variant="secondary" className="mt-4">Wkrótce</Badge>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Component shown when Fakturownia is not configured
 */
function FakturowniaNotConfigured({ onBack }: { onBack: () => void }): React.JSX.Element {
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
        <ArrowLeft className="h-4 w-4" />
        Wybierz inne źródło
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            Fakturownia.pl
          </CardTitle>
          <CardDescription>
            Połącz swoje konto Fakturownia, aby automatycznie importować faktury
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Konfiguracja wymagana</AlertTitle>
            <AlertDescription>
              Aby importować faktury z Fakturownia.pl, musisz najpierw skonfigurować połączenie API.
              Będziesz potrzebować:
              <ul className="mt-2 list-inside list-disc text-sm">
                <li><strong>Subdomenę</strong> – nazwę Twojego konta (np. "mojafirma" z mojafirma.fakturownia.pl)</li>
                <li><strong>Token API</strong> – znajdziesz go w Fakturownia → Ustawienia → Integracje</li>
                <li><strong>ID działu</strong> (opcjonalnie) – jeśli chcesz importować faktury z konkretnego działu</li>
              </ul>
            </AlertDescription>
          </Alert>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild className="flex-1">
              <Link to="/settings">
                <Settings className="mr-2 h-4 w-4" />
                Skonfiguruj w Ustawieniach
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <a
                href="https://app.fakturownia.pl/api"
                target="_blank"
                rel="noopener noreferrer"
                className="gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                Dokumentacja API
              </a>
            </Button>
          </div>

          <div className="mt-6 rounded-lg border border-dashed p-4">
            <h4 className="text-sm font-medium">Nie masz jeszcze Fakturownia?</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Możesz też zaimportować faktury z pliku CSV lub XML wyeksportowanego z Fakturownia.
            </p>
            <Button variant="link" size="sm" className="mt-2 h-auto p-0" onClick={onBack}>
              Importuj z pliku →
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * File-based invoice import (CSV/XML) - backup method
 */
function FileInvoiceImport(): React.JSX.Element {
  const { currentCompany } = useCompany()
  const [step, setStep] = useState<ImportStep>('select')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ParsedInvoice[]>([])
  const [parseErrors, setParseErrors] = useState<ImportError[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [fileImportResult, setFileImportResult] = useState<FileImportResult | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setFile(selectedFile)
    setIsProcessing(true)

    try {
      const content = await selectedFile.text()

      // Detect if file is XML or CSV
      const isXML = isFakturowniaXML(content)

      if (isXML) {
        // Parse XML format
        const validation = validateFakturowniaXML(content)
        if (!validation.valid) {
          toast.error(validation.error || 'Nieprawidłowy format pliku XML')
          setFile(null)
          setIsProcessing(false)
          return
        }

        const result = parseFakturowniaXML(content)
        setPreview(result.data)
        setParseErrors(result.errors)
        setWarnings(result.warnings)

        if (result.data.length > 0) {
          setStep('preview')
          const withSubaccount = result.data.filter((i) => i.buyer_subaccount).length
          toast.success(
            `Rozpoznano ${result.data.length} faktur (XML)${withSubaccount > 0 ? `, ${withSubaccount} z subkontami` : ''}`
          )
        } else {
          toast.error('Nie znaleziono faktur w pliku XML')
          setFile(null)
        }
      } else {
        // Parse CSV format
        const validation = validateFakturowniaFile(content)
        if (!validation.valid) {
          toast.error(validation.error || 'Nieprawidłowy format pliku')
          setFile(null)
          setIsProcessing(false)
          return
        }

        const result = parseFakturowniaCSV(content)
        setPreview(result.data)
        setParseErrors(result.errors)
        setWarnings(result.warnings)

        if (result.data.length > 0) {
          setStep('preview')
          toast.success(`Rozpoznano ${result.data.length} faktur (CSV)`)
        } else {
          toast.error('Nie znaleziono faktur w pliku')
          setFile(null)
        }
      }
    } catch (error) {
      console.error('Error parsing file:', error)
      toast.error('Błąd podczas odczytywania pliku')
      setFile(null)
    } finally {
      setIsProcessing(false)
    }
  }, [])

  const handleClear = useCallback(() => {
    setFile(null)
    setPreview([])
    setParseErrors([])
    setWarnings([])
    setStep('select')
    setFileImportResult(null)
  }, [])

  const handleImport = useCallback(async () => {
    if (!currentCompany) {
      toast.error('Nie wybrano firmy')
      return
    }

    if (preview.length === 0) return

    setStep('importing')

    try {
      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        toast.error('Sesja wygasła. Zaloguj się ponownie.')
        setStep('preview')
        return
      }

      // Prepare invoices for insert with company_id
      const invoicesToInsert = preview.map((inv) => ({
        user_id: user.id,
        company_id: currentCompany.id,
        invoice_number: inv.invoice_number,
        issue_date: inv.issue_date,
        due_date: inv.due_date,
        gross_amount: inv.gross_amount,
        net_amount: inv.net_amount,
        currency: inv.currency,
        buyer_name: inv.buyer_name,
        buyer_nip: inv.buyer_nip,
        buyer_subaccount: inv.buyer_subaccount,
        seller_bank_account: inv.seller_bank_account,
        payment_status: 'pending' as const,
      }))

      // Check for duplicates - filter by company_id
      const { data: existingInvoices } = await supabase
        .from('invoices')
        .select('invoice_number')
        .eq('company_id', currentCompany.id)
        .in(
          'invoice_number',
          invoicesToInsert.map((i) => i.invoice_number)
        )

      const existingNumbers = new Set(existingInvoices?.map((i) => i.invoice_number) || [])
      const newInvoices = invoicesToInsert.filter((i) => !existingNumbers.has(i.invoice_number))
      const skippedCount = invoicesToInsert.length - newInvoices.length

      if (newInvoices.length === 0) {
        toast.info('Wszystkie faktury już istnieją w systemie')
        setFileImportResult({
          imported: 0,
          skipped: skippedCount,
          errors: [],
        })
        setStep('complete')
        return
      }

      // Insert invoices
      const { error } = await supabase.from('invoices').insert(newInvoices)

      if (error) {
        console.error('Import error:', error)
        toast.error('Błąd podczas importu faktur')
        setStep('error')
        return
      }

      setFileImportResult({
        imported: newInvoices.length,
        skipped: skippedCount,
        errors: [],
      })

      toast.success(`Zaimportowano ${newInvoices.length} faktur`)
      setStep('complete')
    } catch (error) {
      console.error('Import error:', error)
      toast.error('Nieoczekiwany błąd podczas importu')
      setStep('error')
    }
  }, [preview, currentCompany])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileUp className="h-5 w-5" />
          Import z pliku CSV / XML
        </CardTitle>
        <CardDescription>
          Zaimportuj faktury z eksportu CSV lub XML z serwisu Fakturownia.pl.
          Format XML zawiera subkonta do automatycznego dopasowania płatności.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {step === 'select' && (
          <FileDropzone
            accept=".csv,.xml"
            onFileSelect={handleFileSelect}
            selectedFile={file}
            onClear={handleClear}
            label="Wybierz plik CSV lub XML z Fakturownia.pl"
            hint="CSV: kolumny Numer, Data wystawienia, Termin płatności, Netto, Brutto, Waluta, Nabywca, NIP. XML: eksport z API (zawiera subkonta)"
            disabled={isProcessing}
          />
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            {/* File info */}
            <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
              <span className="text-sm font-medium">{file?.name}</span>
              <Button variant="ghost" size="sm" onClick={handleClear}>
                Zmień plik
              </Button>
            </div>

            {/* Parse warnings */}
            {warnings.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Ostrzeżenia ({warnings.length})</AlertTitle>
                <AlertDescription>
                  <ul className="mt-2 list-inside list-disc text-sm">
                    {warnings.slice(0, 5).map((warning, i) => (
                      <li key={i}>{warning}</li>
                    ))}
                    {warnings.length > 5 && (
                      <li className="text-muted-foreground">
                        ...i {warnings.length - 5} więcej
                      </li>
                    )}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Parse errors */}
            {parseErrors.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Błędy parsowania ({parseErrors.length})</AlertTitle>
                <AlertDescription>
                  <ul className="mt-2 list-inside list-disc text-sm">
                    {parseErrors.slice(0, 5).map((error, i) => (
                      <li key={i}>
                        Wiersz {error.row}: {error.message}
                        {error.value && ` (wartość: "${error.value}")`}
                      </li>
                    ))}
                    {parseErrors.length > 5 && (
                      <li className="text-muted-foreground">
                        ...i {parseErrors.length - 5} więcej
                      </li>
                    )}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Preview table */}
            <div className="max-h-80 overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">Nr faktury</th>
                    <th className="px-3 py-2 text-left">Nabywca</th>
                    <th className="px-3 py-2 text-right">Kwota brutto</th>
                    <th className="px-3 py-2 text-left">Termin</th>
                    <th className="px-3 py-2 text-left">Konto sprzedawcy</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 20).map((invoice, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2 font-mono text-xs">
                        {invoice.invoice_number}
                      </td>
                      <td className="px-3 py-2">{invoice.buyer_name}</td>
                      <td className="px-3 py-2 text-right">
                        {invoice.gross_amount.toFixed(2)} {invoice.currency}
                      </td>
                      <td className="px-3 py-2">{invoice.due_date}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {invoice.seller_bank_account ? (
                          <span className="text-green-600" title={invoice.seller_bank_account}>
                            ...{invoice.seller_bank_account.replace(/\s/g, '').slice(-8)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 20 && (
                <div className="border-t bg-muted/50 p-2 text-center text-sm text-muted-foreground">
                  ...i {preview.length - 20} więcej faktur
                </div>
              )}
            </div>

            {/* Summary and action - prominent CTA */}
            <div className="rounded-xl border-2 border-green-500 bg-green-50 p-4 dark:bg-green-950/20">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-lg font-semibold text-green-800 dark:text-green-300">
                    ✓ Gotowe do importu: {preview.length} faktur
                  </p>
                  {parseErrors.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                      {parseErrors.length} wierszy zostanie pominiętych z powodu błędów
                    </p>
                  )}
                  <p className="mt-1 text-sm text-green-600 dark:text-green-400">
                    Kliknij przycisk aby zatwierdzić import →
                  </p>
                </div>
                <Button
                  onClick={handleImport}
                  disabled={preview.length === 0}
                  size="lg"
                  className="min-w-[180px] bg-green-600 text-base font-semibold shadow-lg transition-all hover:bg-green-700 hover:shadow-xl"
                >
                  <Upload className="mr-2 h-5 w-5" />
                  Importuj faktury
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-lg font-medium">Importowanie faktur...</p>
            <p className="text-sm text-muted-foreground">To może zająć chwilę</p>
          </div>
        )}

        {step === 'complete' && fileImportResult && (
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center py-8">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <h3 className="mt-4 text-xl font-semibold">Import zakończony</h3>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border bg-green-50 p-4 dark:bg-green-950/20">
                <p className="text-2xl font-bold text-green-600">{fileImportResult.imported}</p>
                <p className="text-sm text-green-600/80">Zaimportowanych faktur</p>
              </div>
              {fileImportResult.skipped > 0 && (
                <div className="rounded-lg border bg-yellow-50 p-4 dark:bg-yellow-950/20">
                  <p className="text-2xl font-bold text-yellow-600">{fileImportResult.skipped}</p>
                  <p className="text-sm text-yellow-600/80">Pominiętych (duplikaty)</p>
                </div>
              )}
            </div>

            <div className="flex justify-center pt-4">
              <Button onClick={handleClear}>Importuj kolejny plik</Button>
            </div>
          </div>
        )}

        {step === 'error' && (
          <div className="flex flex-col items-center justify-center py-8">
            <AlertTriangle className="h-12 w-12 text-destructive" />
            <h3 className="mt-4 text-xl font-semibold">Błąd importu</h3>
            <p className="text-muted-foreground">
              Wystąpił błąd podczas importu. Spróbuj ponownie.
            </p>
            <Button onClick={handleClear} className="mt-4">
              Spróbuj ponownie
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
