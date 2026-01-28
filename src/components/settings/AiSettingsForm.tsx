import { useState, useEffect } from 'react'
import { Loader2, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCompanySettings } from '@/hooks/useCompanySettings'
import { toast } from 'sonner'

const AI_PROVIDERS = [
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
]

export function AiSettingsForm(): React.JSX.Element {
  const { settings, isLoading, saveAiSettings } = useCompanySettings()

  const [enabled, setEnabled] = useState(false)
  const [provider, setProvider] = useState<string>('openrouter')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Initialize form from settings
  useEffect(() => {
    if (settings) {
      setEnabled(settings.ai_enabled)
      setProvider(settings.ai_provider || 'openrouter')
    }
  }, [settings])

  const hasExistingKey = !!settings?.ai_api_key_id
  const keyPlaceholder = hasExistingKey
    ? '••••••••••••••••'
    : 'Wklej klucz API'

  const handleSave = async () => {
    setIsSaving(true)

    const result = await saveAiSettings({
      provider,
      apiKey: apiKey || undefined,  // Only send if changed
      enabled,
    })

    setIsSaving(false)

    if (result.success) {
      toast.success('Ustawienia AI zapisane')
      setApiKey('')  // Clear key input after save
    } else {
      toast.error(result.error || 'Błąd zapisywania')
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
          <Label htmlFor="ai-enabled">Włącz własne API</Label>
          <p className="text-sm text-muted-foreground">
            Używaj własnego klucza API zamiast domyślnego
          </p>
        </div>
        <Switch
          id="ai-enabled"
          checked={enabled}
          onCheckedChange={setEnabled}
        />
      </div>

      {enabled && (
        <>
          {/* Provider select */}
          <div className="space-y-2">
            <Label htmlFor="ai-provider">Dostawca AI</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger className="max-w-xs">
                <SelectValue placeholder="Wybierz dostawcę" />
              </SelectTrigger>
              <SelectContent>
                {AI_PROVIDERS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Wybierz dostawcę API dla funkcji AI
            </p>
          </div>

          {/* API Key */}
          <div className="space-y-2">
            <Label htmlFor="ai-api-key">Klucz API</Label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-md">
                <Input
                  id="ai-api-key"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={keyPlaceholder}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            {hasExistingKey && (
              <p className="text-xs text-green-600">
                Klucz jest już skonfigurowany. Wpisz nowy, aby go zmienić.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {provider === 'openrouter' && 'Klucz znajdziesz na: openrouter.ai/keys'}
              {provider === 'openai' && 'Klucz znajdziesz na: platform.openai.com/api-keys'}
              {provider === 'anthropic' && 'Klucz znajdziesz na: console.anthropic.com/settings/keys'}
            </p>
          </div>
        </>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-4 border-t">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Zapisz ustawienia
        </Button>
      </div>
    </div>
  )
}

export default AiSettingsForm
