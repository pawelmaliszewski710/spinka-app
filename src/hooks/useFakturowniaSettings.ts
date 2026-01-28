import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'invoicematch_fakturownia_settings'

// Domyślne wartości dla zakresu dat (bieżący miesiąc)
function getDefaultDates() {
  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  return {
    dateFrom: firstDay.toISOString().split('T')[0],
    dateTo: lastDay.toISOString().split('T')[0],
  }
}

// Domyślne ustawienia
function getDefaultSettings(): FakturowniaSettings {
  const dates = getDefaultDates()
  return {
    dateFrom: dates.dateFrom,
    dateTo: dates.dateTo,
    kinds: ['vat', 'proforma', 'canceled', 'correction'],
    statuses: ['issued', 'sent', 'paid', 'partial'],
    prefixFilter: '',
  }
}

export interface FakturowniaSettings {
  dateFrom: string
  dateTo: string
  kinds: string[]
  statuses: string[]
  prefixFilter: string
}

interface UseFakturowniaSettingsResult {
  settings: FakturowniaSettings
  updateSettings: (newSettings: Partial<FakturowniaSettings>) => void
  resetSettings: () => void
  hasStoredSettings: boolean
}

/**
 * Hook do zarządzania i persystencji ustawień filtrów Fakturownia.
 * Ustawienia są zapisywane w localStorage i przywracane przy następnej wizycie.
 */
export function useFakturowniaSettings(): UseFakturowniaSettingsResult {
  const [hasStoredSettings, setHasStoredSettings] = useState(false)

  // Inicjalizuj stan z localStorage lub domyślnych wartości
  const [settings, setSettings] = useState<FakturowniaSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as FakturowniaSettings
        // Walidacja zapisanych danych
        if (
          parsed.dateFrom &&
          parsed.dateTo &&
          Array.isArray(parsed.kinds) &&
          Array.isArray(parsed.statuses)
        ) {
          return {
            dateFrom: parsed.dateFrom,
            dateTo: parsed.dateTo,
            kinds: parsed.kinds,
            statuses: parsed.statuses,
            prefixFilter: parsed.prefixFilter || '',
          }
        }
      }
    } catch (error) {
      console.error('Error loading Fakturownia settings:', error)
    }
    return getDefaultSettings()
  })

  // Sprawdź czy są zapisane ustawienia
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    setHasStoredSettings(!!saved)
  }, [])

  // Zapisz ustawienia do localStorage przy każdej zmianie
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
      setHasStoredSettings(true)
    } catch (error) {
      console.error('Error saving Fakturownia settings:', error)
    }
  }, [settings])

  // Aktualizuj częściowo ustawienia
  const updateSettings = useCallback((newSettings: Partial<FakturowniaSettings>) => {
    setSettings((prev) => ({
      ...prev,
      ...newSettings,
    }))
  }, [])

  // Resetuj do domyślnych wartości
  const resetSettings = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY)
      setHasStoredSettings(false)
    } catch (error) {
      console.error('Error removing Fakturownia settings:', error)
    }
    setSettings(getDefaultSettings())
  }, [])

  return {
    settings,
    updateSettings,
    resetSettings,
    hasStoredSettings,
  }
}

export default useFakturowniaSettings
