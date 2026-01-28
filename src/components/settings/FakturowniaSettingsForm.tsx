import { useState, useEffect } from 'react'
import { Loader2, CheckCircle2, AlertTriangle, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useCompanySettings } from '@/hooks/useCompanySettings'
import { toast } from 'sonner'

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
      {/* Enable toggle */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="fakturownia-enabled">Włącz integrację</Label>
          <p className="text-sm text-muted-foreground">
            Pozwól na import faktur z Fakturownia.pl
          </p>
        </div>
        <Switch
          id="fakturownia-enabled"
          checked={enabled}
          onCheckedChange={setEnabled}
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
              Token znajdziesz w: Fakturownia &rarr; Ustawienia &rarr; Integracje &rarr; API
            </p>
          </div>

          {/* Department ID */}
          <div className="space-y-2">
            <Label htmlFor="department-id">ID Działu (opcjonalne)</Label>
            <Input
              id="department-id"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              placeholder="np. 12345"
              className="max-w-xs"
            />
            <p className="text-xs text-muted-foreground">
              Jeśli korzystasz z działów w Fakturownia, podaj ID działu aby filtrować faktury.
              Znajdziesz go w: Ustawienia &rarr; Działy firmy.
            </p>
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
