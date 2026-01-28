import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Upload, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { FileDropzone } from './FileDropzone'
import { parsePayments } from '@/lib/parsers'
import type { ParsedPayment, ImportError } from '@/types'
import type { ImportSource } from '@/lib/constants'
import { supabase } from '@/lib/supabase'
import { useCompany } from '@/contexts/CompanyContext'

type ImportStep = 'select' | 'preview' | 'importing' | 'complete' | 'error'

interface ImportResult {
  imported: number
  skipped: number
  errors: ImportError[]
}

const FORMAT_LABELS: Record<ImportSource | 'mbank_corporate' | 'mbank_sme' | 'pko' | 'unknown', string> = {
  fakturownia: 'Fakturownia',
  mt940: 'MT940',
  mbank: 'mBank CSV',
  mbank_corporate: 'mBank Corporate',
  mbank_sme: 'mBank MŚP',
  ing: 'ING CSV',
  pekao: 'Pekao SA',
  pko: 'PKO BP',
  unknown: 'Nieznany',
}

export function PaymentImport(): React.JSX.Element {
  const { currentCompany } = useCompany()
  const [step, setStep] = useState<ImportStep>('select')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ParsedPayment[]>([])
  const [parseErrors, setParseErrors] = useState<ImportError[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [detectedFormat, setDetectedFormat] = useState<ImportSource | 'mbank_corporate' | 'mbank_sme' | 'pko' | 'unknown'>('unknown')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setFile(selectedFile)
    setIsProcessing(true)

    try {
      const content = await selectedFile.text()

      // Detect and parse the file
      const result = parsePayments(content)
      setPreview(result.data)
      setParseErrors(result.errors)
      setWarnings(result.warnings)
      setDetectedFormat(result.detectedFormat)

      if (result.detectedFormat === 'unknown') {
        toast.error('Nie rozpoznano formatu pliku')
        setFile(null)
        setIsProcessing(false)
        return
      }

      if (result.data.length > 0) {
        setStep('preview')
        toast.success(
          `Rozpoznano format ${FORMAT_LABELS[result.detectedFormat]}: ${result.data.length} płatności`
        )
      } else if (result.errors.length === 0) {
        toast.info('Nie znaleziono płatności przychodzących w pliku')
        setFile(null)
      } else {
        toast.error('Błąd podczas parsowania pliku')
        setFile(null)
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
    setDetectedFormat('unknown')
    setStep('select')
    setImportResult(null)
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

      // Prepare payments for insert with company_id
      const sourceType = detectedFormat === 'unknown' ? 'mt940' : detectedFormat
      const paymentsToInsert = preview.map((payment) => ({
        user_id: user.id,
        company_id: currentCompany.id,
        transaction_date: payment.transaction_date,
        amount: payment.amount,
        currency: payment.currency,
        sender_name: payment.sender_name,
        sender_account: payment.sender_account,
        sender_subaccount: payment.sender_subaccount,
        title: payment.title,
        extended_title: payment.extended_title || null,
        reference: payment.reference,
        source: sourceType as 'mt940' | 'mbank' | 'mbank_corporate' | 'mbank_sme' | 'ing' | 'pekao' | 'fakturownia',
        source_file: file?.name || null,
      }))

      // Use upsert with ignoreDuplicates to handle duplicates at database level
      // This is more reliable than checking references in batches
      const { data: insertedData, error } = await supabase
        .from('payments')
        .upsert(paymentsToInsert, {
          onConflict: 'company_id,reference',
          ignoreDuplicates: true,
        })
        .select('id')

      // Count how many were actually inserted vs skipped
      const insertedCount = insertedData?.length || 0
      const skippedCount = paymentsToInsert.length - insertedCount

      if (error) {
        console.error('Import error:', error)
        toast.error('Błąd podczas importu płatności')
        setStep('error')
        return
      }

      setImportResult({
        imported: insertedCount,
        skipped: skippedCount,
        errors: [],
      })

      if (insertedCount === 0) {
        toast.info('Wszystkie płatności już istnieją w systemie')
      } else {
        toast.success(`Zaimportowano ${insertedCount} płatności`)
      }
      setStep('complete')
    } catch (error) {
      console.error('Import error:', error)
      toast.error('Nieoczekiwany błąd podczas importu')
      setStep('error')
    }
  }, [preview, detectedFormat, file?.name, currentCompany])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Import wyciągu bankowego
        </CardTitle>
        <CardDescription>
          Zaimportuj płatności z wyciągu bankowego (MT940, mBank CSV, mBank MŚP, ING CSV, Pekao SA)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {step === 'select' && (
          <FileDropzone
            accept=".csv,.sta,.mt940,.txt"
            onFileSelect={handleFileSelect}
            selectedFile={file}
            onClear={handleClear}
            label="Wybierz wyciąg bankowy"
            hint="Obsługiwane formaty: MT940 (.sta, .mt940), mBank CSV, mBank MŚP, ING CSV, Pekao SA"
            disabled={isProcessing}
          />
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            {/* File info */}
            <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
              <div>
                <span className="text-sm font-medium">{file?.name}</span>
                <span className="ml-2 rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {FORMAT_LABELS[detectedFormat]}
                </span>
              </div>
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
                    <th className="px-3 py-2 text-left">Data</th>
                    <th className="px-3 py-2 text-left">Nadawca</th>
                    <th className="px-3 py-2 text-left">Tytuł</th>
                    <th className="px-3 py-2 text-right">Kwota</th>
                    <th className="px-3 py-2 text-left">Subkonto</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 20).map((payment, i) => (
                    <tr key={i} className="border-t">
                      <td className="whitespace-nowrap px-3 py-2">
                        {payment.transaction_date}
                      </td>
                      <td className="px-3 py-2">{payment.sender_name}</td>
                      <td className="max-w-xs truncate px-3 py-2" title={payment.title}>
                        {payment.title}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-green-600">
                        +{payment.amount.toFixed(2)} {payment.currency}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {payment.sender_subaccount ? (
                          <span className="text-blue-600" title={payment.sender_subaccount}>
                            ...{payment.sender_subaccount.slice(-10)}
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
                  ...i {preview.length - 20} więcej płatności
                </div>
              )}
            </div>

            {/* Summary */}
            <div className="rounded-lg bg-green-50 p-4 dark:bg-green-950/20">
              <p className="text-lg font-medium text-green-700 dark:text-green-400">
                Suma: {preview.reduce((sum, p) => sum + p.amount, 0).toFixed(2)} PLN
              </p>
              <p className="text-sm text-green-600/80 dark:text-green-400/80">
                {preview.length} transakcji przychodzących
              </p>
            </div>

            {/* Action */}
            <div className="flex items-center justify-between rounded-lg bg-primary/5 p-4">
              <div>
                <p className="font-medium">Gotowe do importu: {preview.length} płatności</p>
              </div>
              <Button onClick={handleImport} disabled={preview.length === 0}>
                Importuj płatności
              </Button>
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-lg font-medium">Importowanie płatności...</p>
            <p className="text-sm text-muted-foreground">To może zająć chwilę</p>
          </div>
        )}

        {step === 'complete' && importResult && (
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center py-8">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <h3 className="mt-4 text-xl font-semibold">Import zakończony</h3>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border bg-green-50 p-4 dark:bg-green-950/20">
                <p className="text-2xl font-bold text-green-600">{importResult.imported}</p>
                <p className="text-sm text-green-600/80">Zaimportowanych płatności</p>
              </div>
              {importResult.skipped > 0 && (
                <div className="rounded-lg border bg-yellow-50 p-4 dark:bg-yellow-950/20">
                  <p className="text-2xl font-bold text-yellow-600">{importResult.skipped}</p>
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
