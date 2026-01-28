import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/hooks/useAuth'
import type { CompanyIntegration } from '@/types'

interface SaveFakturowniaParams {
  subdomain: string
  apiToken?: string  // Only provided when updating token
  departmentId?: string  // Fakturownia department ID for filtering
  enabled: boolean
}

interface SaveAiParams {
  provider: string
  apiKey?: string  // Only provided when updating key
  enabled: boolean
}

interface UseCompanySettingsResult {
  settings: CompanyIntegration | null
  isLoading: boolean
  error: string | null

  // Fakturownia
  saveFakturowniaSettings: (params: SaveFakturowniaParams) => Promise<{ success: boolean; error?: string }>
  testFakturowniaConnection: () => Promise<{ success: boolean; error?: string }>

  // AI
  saveAiSettings: (params: SaveAiParams) => Promise<{ success: boolean; error?: string }>

  // Refresh
  refresh: () => Promise<void>
}

export function useCompanySettings(): UseCompanySettingsResult {
  const { user } = useAuth()
  const { currentCompany } = useCompany()
  const [settings, setSettings] = useState<CompanyIntegration | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch settings for current company
  const fetchSettings = useCallback(async () => {
    if (!user || !currentCompany) {
      setSettings(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const { data, error: fetchError } = await supabase
        .from('company_integrations')
        .select('*')
        .eq('company_id', currentCompany.id)
        .maybeSingle()

      if (fetchError) {
        throw fetchError
      }

      setSettings(data || null)
    } catch (err) {
      console.error('Error fetching company settings:', err)
      setError(err instanceof Error ? err.message : 'Błąd pobierania ustawień')
    } finally {
      setIsLoading(false)
    }
  }, [user, currentCompany])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  // Save Fakturownia settings
  const saveFakturowniaSettings = useCallback(async (params: SaveFakturowniaParams) => {
    if (!user || !currentCompany) {
      return { success: false, error: 'Brak sesji lub firmy' }
    }

    try {
      let tokenId = settings?.fakturownia_api_token_id

      // If new token provided, store it in vault
      if (params.apiToken) {
        const secretName = `fakturownia_${currentCompany.id}`

        if (tokenId) {
          // Update existing secret
          const { error: updateError } = await supabase.rpc('update_integration_secret', {
            p_secret_id: tokenId,
            p_new_secret: params.apiToken
          })

          if (updateError) throw updateError
        } else {
          // Create new secret
          const { data: newTokenId, error: secretError } = await supabase.rpc(
            'store_integration_secret',
            {
              p_secret: params.apiToken,
              p_name: secretName,
              p_description: `Fakturownia API token for company ${currentCompany.name}`
            }
          )

          if (secretError) throw secretError
          tokenId = newTokenId
        }
      }

      // Prepare integration data
      const integrationData = {
        user_id: user.id,
        company_id: currentCompany.id,
        fakturownia_enabled: params.enabled,
        fakturownia_subdomain: params.subdomain || null,
        fakturownia_api_token_id: tokenId,
        fakturownia_department_id: params.departmentId || null,
      }

      if (settings?.id) {
        // Update existing
        const { error: updateError } = await supabase
          .from('company_integrations')
          .update({
            fakturownia_enabled: integrationData.fakturownia_enabled,
            fakturownia_subdomain: integrationData.fakturownia_subdomain,
            fakturownia_api_token_id: integrationData.fakturownia_api_token_id,
            fakturownia_department_id: integrationData.fakturownia_department_id,
          })
          .eq('id', settings.id)

        if (updateError) throw updateError
      } else {
        // Insert new
        const { error: insertError } = await supabase
          .from('company_integrations')
          .insert(integrationData)

        if (insertError) throw insertError
      }

      await fetchSettings()
      return { success: true }
    } catch (err) {
      console.error('Error saving Fakturownia settings:', err)
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Błąd zapisywania ustawień'
      }
    }
  }, [user, currentCompany, settings, fetchSettings])

  // Test Fakturownia connection
  const testFakturowniaConnection = useCallback(async () => {
    if (!currentCompany) {
      return { success: false, error: 'Brak wybranej firmy' }
    }

    if (!settings?.fakturownia_enabled || !settings?.fakturownia_subdomain || !settings?.fakturownia_api_token_id) {
      return { success: false, error: 'Integracja Fakturownia nie jest skonfigurowana' }
    }

    try {
      // Call the proxy with a test endpoint
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        return { success: false, error: 'Brak sesji' }
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fakturownia-proxy`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            endpoint: '/invoices.json?page=1&per_page=1',
            method: 'GET',
            companyId: currentCompany.id,
          }),
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }))
        return { success: false, error: errorData.error || 'Błąd połączenia' }
      }

      return { success: true }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Błąd testu połączenia'
      }
    }
  }, [currentCompany, settings])

  // Save AI settings
  const saveAiSettings = useCallback(async (params: SaveAiParams) => {
    if (!user || !currentCompany) {
      return { success: false, error: 'Brak sesji lub firmy' }
    }

    try {
      let keyId = settings?.ai_api_key_id

      // If new key provided, store it in vault
      if (params.apiKey) {
        const secretName = `ai_${params.provider}_${currentCompany.id}`

        if (keyId) {
          // Update existing secret
          const { error: updateError } = await supabase.rpc('update_integration_secret', {
            p_secret_id: keyId,
            p_new_secret: params.apiKey
          })

          if (updateError) throw updateError
        } else {
          // Create new secret
          const { data: newKeyId, error: secretError } = await supabase.rpc(
            'store_integration_secret',
            {
              p_secret: params.apiKey,
              p_name: secretName,
              p_description: `AI API key (${params.provider}) for company ${currentCompany.name}`
            }
          )

          if (secretError) throw secretError
          keyId = newKeyId
        }
      }

      // Prepare integration data
      const integrationData = {
        user_id: user.id,
        company_id: currentCompany.id,
        ai_enabled: params.enabled,
        ai_provider: params.provider || null,
        ai_api_key_id: keyId,
      }

      if (settings?.id) {
        // Update existing
        const { error: updateError } = await supabase
          .from('company_integrations')
          .update({
            ai_enabled: integrationData.ai_enabled,
            ai_provider: integrationData.ai_provider,
            ai_api_key_id: integrationData.ai_api_key_id,
          })
          .eq('id', settings.id)

        if (updateError) throw updateError
      } else {
        // Insert new
        const { error: insertError } = await supabase
          .from('company_integrations')
          .insert(integrationData)

        if (insertError) throw insertError
      }

      await fetchSettings()
      return { success: true }
    } catch (err) {
      console.error('Error saving AI settings:', err)
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Błąd zapisywania ustawień'
      }
    }
  }, [user, currentCompany, settings, fetchSettings])

  return {
    settings,
    isLoading,
    error,
    saveFakturowniaSettings,
    testFakturowniaConnection,
    saveAiSettings,
    refresh: fetchSettings,
  }
}

export default useCompanySettings
