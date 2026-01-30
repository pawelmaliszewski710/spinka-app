import { useState, useEffect } from 'react'
import { Loader2, CheckCircle2, AlertTriangle, Eye, EyeOff, Globe, ZoomIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useCompanySettings } from '@/hooks/useCompanySettings'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export function FakturowniaSettingsForm(): React.JSX.Element {
  const { settings, isLoading, saveFakturowniaSettings, testFakturowniaConnection } = useCompanySettings()

  const [enabled, setEnabled] = useState(false)
  const [subdomain, setSubdomain] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null)
  const [isTogglingEnabled, setIsTogglingEnabled] = useState(false)

  // Initialize form from settings
  useEffect(() => {
    if (settings) {
      setEnabled(settings.fakturownia_enabled)
      setSubdomain(settings.fakturownia_subdomain || '')
      setDepartmentId(settings.fakturownia_department_id || '')
    }
  }, [settings])

  const hasExistingToken = !!settings?.fakturownia_api_token_id
  const tokenPlaceholder = hasExistingToken
    ? '••••••••••••••••'
    : 'Wklej token API'

  // Auto-save toggle immediately
  const handleToggleEnabled = async (newValue: boolean) => {
    setEnabled(newValue)
    setIsTogglingEnabled(true)

    const result = await saveFakturowniaSettings({
      subdomain: subdomain || settings?.fakturownia_subdomain || '',
      apiToken: undefined,  // Don't change token
      departmentId: departmentId || settings?.fakturownia_department_id || undefined,
      enabled: newValue,
    })

    setIsTogglingEnabled(false)

    if (result.success) {
      toast.success(newValue ? 'Integracja włączona' : 'Integracja wyłączona')
    } else {
      // Revert on error
      setEnabled(!newValue)
      toast.error(result.error || 'Błąd zapisywania')
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setTestResult(null)

    const result = await saveFakturowniaSettings({
      subdomain,
      apiToken: apiToken || undefined,  // Only send if changed
      departmentId: departmentId || undefined,
      enabled,
    })

    setIsSaving(false)

    if (result.success) {
      toast.success('Ustawienia Fakturownia zapisane')
      setApiToken('')  // Clear token input after save
    } else {
      toast.error(result.error || 'Błąd zapisywania')
    }
  }

  const handleTest = async () => {
    setIsTesting(true)
    setTestResult(null)

    const result = await testFakturowniaConnection()

    setIsTesting(false)
    setTestResult(result.success ? 'success' : 'error')

    if (result.success) {
      toast.success('Połączenie z Fakturownia działa poprawnie')
    } else {
      toast.error(result.error || 'Błąd połączenia')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Enable toggle - more prominent */}
      <div className={cn(
        "flex items-center justify-between rounded-xl border-2 p-4 transition-all",
        enabled
          ? "border-green-500 bg-green-50 dark:bg-green-950/20"
          : "border-dashed border-muted-foreground/30 bg-muted/30"
      )}>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Label htmlFor="fakturownia-enabled" className="text-base font-semibold">
              Włącz integrację
            </Label>
            {enabled && (
              <span className="rounded-full bg-green-500 px-2 py-0.5 text-xs font-medium text-white">
                Aktywna
              </span>
            )}
            {isTogglingEnabled && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Pozwól na import faktur z Fakturownia.pl
          </p>
        </div>
        <Switch
          id="fakturownia-enabled"
          checked={enabled}
          onCheckedChange={handleToggleEnabled}
          disabled={isTogglingEnabled}
          className={cn(
            "scale-125",
            enabled && "data-[state=checked]:bg-green-500"
          )}
        />
      </div>

      {enabled && (
        <>
          {/* Subdomain */}
          <div className="space-y-2">
            <Label htmlFor="subdomain">Subdomena</Label>
            <div className="flex items-center gap-2">
              <Input
                id="subdomain"
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value)}
                placeholder="firma123"
                className="max-w-xs"
              />
              <span className="text-sm text-muted-foreground">.fakturownia.pl</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Podaj subdomenę z adresu Twojego konta Fakturownia
            </p>
          </div>

          {/* API Token */}
          <div className="space-y-2">
            <Label htmlFor="api-token">Token API</Label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-md">
                <Input
                  id="api-token"
                  type={showToken ? 'text' : 'password'}
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder={tokenPlaceholder}
                  className={apiToken ? 'pr-10' : ''}
                />
                {apiToken && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowToken(!showToken)}
                  >
                    {showToken ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            </div>
            {hasExistingToken && !apiToken && (
              <p className="text-xs text-green-600">
                Token jest już skonfigurowany. Wpisz nowy, aby go zmienić.
              </p>
            )}
            {apiToken && (
              <p className="text-xs text-amber-600">
                Nowy token zostanie zapisany po kliknięciu "Zapisz ustawienia".
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Token znajdziesz w: <strong>Ustawienia → Ustawienia konta → Integracja → Kod autoryzacyjny API</strong>
            </p>

            {/* Screenshot with lightbox */}
            <Dialog>
              <DialogTrigger asChild>
                <button className="group mt-2 block overflow-hidden rounded-lg border border-dashed border-muted-foreground/30 transition-all hover:border-primary/50 hover:shadow-md">
                  <div className="relative">
                    <img
                      src="/screenshots/FakturowniaApiToken.png"
                      alt="Gdzie znaleźć Token API w Fakturownia"
                      className="h-32 w-auto object-cover object-top opacity-80 transition-opacity group-hover:opacity-100"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
                      <div className="flex items-center gap-1 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-gray-800">
                        <ZoomIn className="h-3 w-3" />
                        Powiększ
                      </div>
                    </div>
                  </div>
                  <div className="bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
                    Kliknij aby powiększyć
                  </div>
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl">
                <DialogHeader>
                  <DialogTitle>Gdzie znaleźć Token API</DialogTitle>
                  <DialogDescription>
                    Ustawienia → Ustawienia konta → Integracja → Kod autoryzacyjny API
                  </DialogDescription>
                </DialogHeader>
                <div className="overflow-auto rounded-lg border">
                  <img
                    src="/screenshots/FakturowniaApiToken.png"
                    alt="Gdzie znaleźć Token API w Fakturownia"
                    className="w-full"
                  />
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Department ID - with visual URL bar */}
          <div className="space-y-2">
            <Label htmlFor="department-id">ID Działu (opcjonalne)</Label>
            <Input
              id="department-id"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              placeholder="np. 123456"
              className="max-w-xs"
            />
            <div className="mt-3 rounded-lg border border-dashed bg-muted/30 p-4">
              <p className="mb-3 text-sm text-muted-foreground">
                <strong>Jak znaleźć ID działu?</strong> Wejdź w <strong>Ustawienia → Dane firmy</strong>,
                kliknij w nazwę firmy/działu, a następnie odczytaj numer z paska adresu:
              </p>

              {/* Visual URL bar */}
              <div className="flex items-center gap-2 rounded-lg border bg-white dark:bg-gray-900 p-2 shadow-inner">
                <div className="flex h-7 w-7 items-center justify-center rounded bg-gray-100 dark:bg-gray-800">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center gap-1 font-mono text-sm">
                    <span className="text-muted-foreground">https://</span>
                    <span className="text-green-600">twojafirma</span>
                    <span className="text-muted-foreground">.fakturownia.pl/departments/</span>
                    <span className="rounded bg-yellow-100 px-1.5 py-0.5 font-bold text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-400">
                      123456
                    </span>
                    <span className="text-muted-foreground">/edit</span>
                  </div>
                </div>
              </div>

              <p className="mt-3 text-xs text-muted-foreground">
                Podświetlony numer <span className="rounded bg-yellow-100 px-1 font-mono font-bold text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-400">123456</span> to ID działu.
                Skopiuj go i wklej powyżej.
              </p>
            </div>
          </div>

          {/* Test result */}
          {testResult && (
            <Alert variant={testResult === 'success' ? 'default' : 'destructive'}>
              {testResult === 'success' ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              <AlertDescription>
                {testResult === 'success'
                  ? 'Połączenie z Fakturownia działa poprawnie!'
                  : 'Nie udało się połączyć. Sprawdź subdomenę i token.'}
              </AlertDescription>
            </Alert>
          )}
        </>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-4 border-t">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Zapisz ustawienia
        </Button>
        {enabled && hasExistingToken && (
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={isTesting || !subdomain}
          >
            {isTesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Testuj połączenie
          </Button>
        )}
      </div>
    </div>
  )
}

export default FakturowniaSettingsForm
