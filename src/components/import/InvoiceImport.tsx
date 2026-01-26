import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Upload, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { FileDropzone } from './FileDropzone'
import { parseFakturowniaCSV, validateFakturowniaFile } from '@/lib/parsers'
import type { ParsedInvoice, ImportError } from '@/types'
import { supabase } from '@/lib/supabase'

type ImportStep = 'select' | 'preview' | 'importing' | 'complete' | 'error'

interface ImportResult {
  imported: number
  skipped: number
  errors: ImportError[]
}

export function InvoiceImport(): React.JSX.Element {
  const [step, setStep] = useState<ImportStep>('select')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ParsedInvoice[]>([])
  const [parseErrors, setParseErrors] = useState<ImportError[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setFile(selectedFile)
    setIsProcessing(true)

    try {
      const content = await selectedFile.text()

      // Validate file format first
      const validation = validateFakturowniaFile(content)
      if (!validation.valid) {
        toast.error(validation.error || 'Nieprawidłowy format pliku')
        setFile(null)
        setIsProcessing(false)
        return
      }

      // Parse the file
      const result = parseFakturowniaCSV(content)
      setPreview(result.data)
      setParseErrors(result.errors)
      setWarnings(result.warnings)

      if (result.data.length > 0) {
        setStep('preview')
        toast.success(`Rozpoznano ${result.data.length} faktur`)
      } else {
        toast.error('Nie znaleziono faktur w pliku')
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
    setStep('select')
    setImportResult(null)
  }, [])

  const handleImport = useCallback(async () => {
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

      // Prepare invoices for insert
      const invoicesToInsert = preview.map((inv) => ({
        user_id: user.id,
        invoice_number: inv.invoice_number,
        issue_date: inv.issue_date,
        due_date: inv.due_date,
        gross_amount: inv.gross_amount,
        net_amount: inv.net_amount,
        currency: inv.currency,
        buyer_name: inv.buyer_name,
        buyer_nip: inv.buyer_nip,
        payment_status: 'pending' as const,
      }))

      // Check for duplicates
      const { data: existingInvoices } = await supabase
        .from('invoices')
        .select('invoice_number')
        .eq('user_id', user.id)
        .in(
          'invoice_number',
          invoicesToInsert.map((i) => i.invoice_number)
        )

      const existingNumbers = new Set(existingInvoices?.map((i) => i.invoice_number) || [])
      const newInvoices = invoicesToInsert.filter((i) => !existingNumbers.has(i.invoice_number))
      const skippedCount = invoicesToInsert.length - newInvoices.length

      if (newInvoices.length === 0) {
        toast.info('Wszystkie faktury już istnieją w systemie')
        setImportResult({
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

      setImportResult({
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
  }, [preview])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Import faktur z Fakturownia.pl
        </CardTitle>
        <CardDescription>
          Zaimportuj faktury z eksportu CSV z serwisu Fakturownia.pl
        </CardDescription>
      </CardHeader>
      <CardContent>
        {step === 'select' && (
          <FileDropzone
            accept=".csv"
            onFileSelect={handleFileSelect}
            selectedFile={file}
            onClear={handleClear}
            label="Wybierz plik CSV z Fakturownia.pl"
            hint="Plik powinien zawierać kolumny: Numer, Data wystawienia, Termin płatności, Netto, Brutto, Waluta, Nabywca, NIP nabywcy"
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

            {/* Summary and action */}
            <div className="flex items-center justify-between rounded-lg bg-primary/5 p-4">
              <div>
                <p className="font-medium">Gotowe do importu: {preview.length} faktur</p>
                {parseErrors.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {parseErrors.length} wierszy zostanie pominiętych z powodu błędów
                  </p>
                )}
              </div>
              <Button onClick={handleImport} disabled={preview.length === 0}>
                Importuj faktury
              </Button>
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

        {step === 'complete' && importResult && (
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center py-8">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <h3 className="mt-4 text-xl font-semibold">Import zakończony</h3>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border bg-green-50 p-4 dark:bg-green-950/20">
                <p className="text-2xl font-bold text-green-600">{importResult.imported}</p>
                <p className="text-sm text-green-600/80">Zaimportowanych faktur</p>
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
