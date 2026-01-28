import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useCompany } from '@/contexts/CompanyContext'
import type { Company, CompanyInsert, CompanyUpdate } from '@/types'

interface UseCompaniesResult {
  isLoading: boolean
  error: string | null
  createCompany: (data: Omit<CompanyInsert, 'user_id'>) => Promise<Company | null>
  updateCompany: (id: string, data: CompanyUpdate) => Promise<Company | null>
  deleteCompany: (id: string) => Promise<boolean>
  setDefaultCompany: (id: string) => Promise<boolean>
}

export function useCompanies(): UseCompaniesResult {
  const { user } = useAuth()
  const { refreshCompanies, currentCompany, selectCompany, companies } = useCompany()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createCompany = useCallback(
    async (data: Omit<CompanyInsert, 'user_id'>): Promise<Company | null> => {
      if (!user) {
        toast.error('Musisz być zalogowany')
        return null
      }

      setIsLoading(true)
      setError(null)

      try {
        const { data: newCompany, error: insertError } = await supabase
          .from('companies')
          .insert({
            ...data,
            user_id: user.id,
          })
          .select()
          .single()

        if (insertError) {
          if (insertError.code === '23505') {
            throw new Error('Firma o tej nazwie już istnieje')
          }
          throw insertError
        }

        await refreshCompanies()
        toast.success(`Firma "${newCompany.name}" została utworzona`)
        return newCompany
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Błąd tworzenia firmy'
        setError(message)
        toast.error(message)
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [user, refreshCompanies]
  )

  const updateCompany = useCallback(
    async (id: string, data: CompanyUpdate): Promise<Company | null> => {
      if (!user) {
        toast.error('Musisz być zalogowany')
        return null
      }

      setIsLoading(true)
      setError(null)

      try {
        const { data: updatedCompany, error: updateError } = await supabase
          .from('companies')
          .update(data)
          .eq('id', id)
          .select()
          .single()

        if (updateError) {
          if (updateError.code === '23505') {
            throw new Error('Firma o tej nazwie już istnieje')
          }
          throw updateError
        }

        await refreshCompanies()
        toast.success(`Firma "${updatedCompany.name}" została zaktualizowana`)
        return updatedCompany
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Błąd aktualizacji firmy'
        setError(message)
        toast.error(message)
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [user, refreshCompanies]
  )

  const deleteCompany = useCallback(
    async (id: string): Promise<boolean> => {
      if (!user) {
        toast.error('Musisz być zalogowany')
        return false
      }

      // Prevent deleting the only company
      if (companies.length <= 1) {
        toast.error('Nie można usunąć jedynej firmy')
        return false
      }

      // Prevent deleting current company
      if (currentCompany?.id === id) {
        toast.error('Nie można usunąć aktywnej firmy. Najpierw przełącz się na inną.')
        return false
      }

      setIsLoading(true)
      setError(null)

      try {
        const companyToDelete = companies.find(c => c.id === id)

        const { error: deleteError } = await supabase
          .from('companies')
          .delete()
          .eq('id', id)

        if (deleteError) {
          throw deleteError
        }

        await refreshCompanies()
        toast.success(`Firma "${companyToDelete?.name}" została usunięta`)
        return true
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Błąd usuwania firmy'
        setError(message)
        toast.error(message)
        return false
      } finally {
        setIsLoading(false)
      }
    },
    [user, refreshCompanies, currentCompany, companies]
  )

  const setDefaultCompany = useCallback(
    async (id: string): Promise<boolean> => {
      if (!user) {
        toast.error('Musisz być zalogowany')
        return false
      }

      setIsLoading(true)
      setError(null)

      try {
        // The trigger will handle unsetting other defaults
        const { error: updateError } = await supabase
          .from('companies')
          .update({ is_default: true })
          .eq('id', id)

        if (updateError) {
          throw updateError
        }

        await refreshCompanies()
        selectCompany(id)
        toast.success('Domyślna firma została zmieniona')
        return true
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Błąd ustawiania domyślnej firmy'
        setError(message)
        toast.error(message)
        return false
      } finally {
        setIsLoading(false)
      }
    },
    [user, refreshCompanies, selectCompany]
  )

  return {
    isLoading,
    error,
    createCompany,
    updateCompany,
    deleteCompany,
    setDefaultCompany,
  }
}

export default useCompanies
