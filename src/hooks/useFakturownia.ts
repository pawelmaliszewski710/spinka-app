import { useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { fakturowniaApi, FakturowniaApiError } from '@/lib/fakturownia-api'
import type {
  FakturowniaInvoice,
  FakturowniaClient,
  GetInvoicesParams,
  GetClientsParams,
} from '@/lib/fakturownia-api'
import { useCompany } from '@/contexts/CompanyContext'

export interface UseFakturowniaResult {
  // State
  isLoading: boolean
  isConfigured: boolean
  isCheckingConfig: boolean
  error: string | null

  // Invoices
  invoices: FakturowniaInvoice[]
  fetchInvoices: (params?: GetInvoicesParams) => Promise<FakturowniaInvoice[]>
  fetchUnpaidInvoices: () => Promise<FakturowniaInvoice[]>
  fetchOverdueInvoices: () => Promise<FakturowniaInvoice[]>

  // Clients
  clients: FakturowniaClient[]
  fetchClients: (params?: GetClientsParams) => Promise<FakturowniaClient[]>

  // Utility
  testConnection: () => Promise<boolean>
  clearError: () => void
}

export function useFakturownia(): UseFakturowniaResult {
  const { currentCompany } = useCompany()
  const [isLoading, setIsLoading] = useState(false)
  const [isCheckingConfig, setIsCheckingConfig] = useState(true)
  const [isConfigured, setIsConfigured] = useState(true) // Assume configured until proven otherwise
  const [error, setError] = useState<string | null>(null)
  const [invoices, setInvoices] = useState<FakturowniaInvoice[]>([])
  const [clients, setClients] = useState<FakturowniaClient[]>([])

  // Check API configuration when company changes
  useEffect(() => {
    let cancelled = false

    const checkConfig = async () => {
      if (!currentCompany) {
        setIsCheckingConfig(false)
        setIsConfigured(false)
        return
      }

      setIsCheckingConfig(true)

      try {
        const configured = await fakturowniaApi.isConfigured(currentCompany.id)
        if (!cancelled) {
          setIsConfigured(configured)
        }
      } catch {
        if (!cancelled) {
          setIsConfigured(false)
        }
      } finally {
        if (!cancelled) {
          setIsCheckingConfig(false)
        }
      }
    }

    checkConfig()

    return () => {
      cancelled = true
    }
  }, [currentCompany])

  const handleError = useCallback((err: unknown) => {
    let message = 'Unknown error occurred'

    if (err instanceof FakturowniaApiError) {
      message = err.message
      if (err.statusCode === 401) {
        message = 'Invalid API token. Check your configuration.'
      } else if (err.statusCode === 404) {
        message = 'Resource not found.'
      } else if (err.statusCode === 500 && message.includes('not configured')) {
        setIsConfigured(false)
        message = 'Fakturownia API nie jest skonfigurowane na serwerze.'
      }
    } else if (err instanceof Error) {
      message = err.message
    }

    setError(message)
    toast.error(`Fakturownia API: ${message}`)
    console.error('Fakturownia API error:', err)
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const testConnection = useCallback(async (): Promise<boolean> => {
    if (!currentCompany) {
      toast.error('Nie wybrano firmy')
      return false
    }

    setIsLoading(true)
    setError(null)

    try {
      const result = await fakturowniaApi.testConnection(currentCompany.id)
      if (result) {
        toast.success('Połączenie z Fakturownia API działa poprawnie')
      } else {
        toast.error('Nie udało się połączyć z Fakturownia API')
      }
      return result
    } catch (err) {
      handleError(err)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [handleError, currentCompany])

  const fetchInvoices = useCallback(
    async (params: GetInvoicesParams = {}): Promise<FakturowniaInvoice[]> => {
      if (!currentCompany) {
        toast.error('Nie wybrano firmy')
        return []
      }

      setIsLoading(true)
      setError(null)

      try {
        const data = await fakturowniaApi.getInvoices(currentCompany.id, params)
        setInvoices(data)
        return data
      } catch (err) {
        handleError(err)
        return []
      } finally {
        setIsLoading(false)
      }
    },
    [handleError, currentCompany]
  )

  const fetchUnpaidInvoices = useCallback(async (): Promise<FakturowniaInvoice[]> => {
    if (!currentCompany) {
      toast.error('Nie wybrano firmy')
      return []
    }

    setIsLoading(true)
    setError(null)

    try {
      const data = await fakturowniaApi.getUnpaidInvoices(currentCompany.id)
      setInvoices(data)
      return data
    } catch (err) {
      handleError(err)
      return []
    } finally {
      setIsLoading(false)
    }
  }, [handleError, currentCompany])

  const fetchOverdueInvoices = useCallback(async (): Promise<FakturowniaInvoice[]> => {
    if (!currentCompany) {
      toast.error('Nie wybrano firmy')
      return []
    }

    setIsLoading(true)
    setError(null)

    try {
      const data = await fakturowniaApi.getOverdueInvoices(currentCompany.id)
      setInvoices(data)
      return data
    } catch (err) {
      handleError(err)
      return []
    } finally {
      setIsLoading(false)
    }
  }, [handleError, currentCompany])

  const fetchClients = useCallback(
    async (params: GetClientsParams = {}): Promise<FakturowniaClient[]> => {
      if (!currentCompany) {
        toast.error('Nie wybrano firmy')
        return []
      }

      setIsLoading(true)
      setError(null)

      try {
        const data = await fakturowniaApi.getClients(currentCompany.id, params)
        setClients(data)
        return data
      } catch (err) {
        handleError(err)
        return []
      } finally {
        setIsLoading(false)
      }
    },
    [handleError, currentCompany]
  )

  return {
    isLoading,
    isConfigured,
    isCheckingConfig,
    error,
    invoices,
    fetchInvoices,
    fetchUnpaidInvoices,
    fetchOverdueInvoices,
    clients,
    fetchClients,
    testConnection,
    clearError,
  }
}

export default useFakturownia
