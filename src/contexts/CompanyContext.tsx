import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Company } from '@/types'

const STORAGE_KEY = 'invoicematch_selected_company'

interface CompanyContextType {
  currentCompany: Company | null
  companies: Company[]
  isLoading: boolean
  error: string | null
  selectCompany: (companyId: string) => void
  refreshCompanies: () => Promise<void>
  clearSelection: () => void
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined)

interface CompanyProviderProps {
  children: ReactNode
}

export function CompanyProvider({ children }: CompanyProviderProps): React.JSX.Element {
  const { user } = useAuth()
  const [companies, setCompanies] = useState<Company[]>([])
  const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(() => {
    // Try to restore from localStorage
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY)
    }
    return null
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch companies for current user
  const refreshCompanies = useCallback(async () => {
    if (!user) {
      setCompanies([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const { data, error: fetchError } = await supabase
        .from('companies')
        .select('*')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false })
        .order('name', { ascending: true })

      if (fetchError) {
        throw fetchError
      }

      setCompanies(data || [])

      // If no company is selected and we have companies, select default or first
      if (!currentCompanyId && data && data.length > 0) {
        const defaultCompany = data.find(c => c.is_default) || data[0]
        setCurrentCompanyId(defaultCompany.id)
        localStorage.setItem(STORAGE_KEY, defaultCompany.id)
      }

      // If selected company doesn't exist anymore, clear selection
      if (currentCompanyId && data && !data.find(c => c.id === currentCompanyId)) {
        setCurrentCompanyId(null)
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch (err) {
      console.error('Error fetching companies:', err)
      setError(err instanceof Error ? err.message : 'Błąd pobierania firm')
    } finally {
      setIsLoading(false)
    }
  }, [user, currentCompanyId])

  // Fetch companies when user changes
  useEffect(() => {
    refreshCompanies()
  }, [user?.id]) // Only re-fetch when user ID changes

  // Select a company
  const selectCompany = useCallback((companyId: string) => {
    setCurrentCompanyId(companyId)
    localStorage.setItem(STORAGE_KEY, companyId)
  }, [])

  // Clear selection (on logout)
  const clearSelection = useCallback(() => {
    setCurrentCompanyId(null)
    setCompanies([])
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  // Get current company object
  const currentCompany = useMemo(() => {
    if (!currentCompanyId) return null
    return companies.find(c => c.id === currentCompanyId) || null
  }, [currentCompanyId, companies])

  const value = useMemo(() => ({
    currentCompany,
    companies,
    isLoading,
    error,
    selectCompany,
    refreshCompanies,
    clearSelection,
  }), [currentCompany, companies, isLoading, error, selectCompany, refreshCompanies, clearSelection])

  return (
    <CompanyContext.Provider value={value}>
      {children}
    </CompanyContext.Provider>
  )
}

export function useCompany(): CompanyContextType {
  const context = useContext(CompanyContext)
  if (context === undefined) {
    throw new Error('useCompany must be used within a CompanyProvider')
  }
  return context
}

export default CompanyContext
