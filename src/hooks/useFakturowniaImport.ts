import { useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import {
  fakturowniaApi,
  FakturowniaApiError,
} from '@/lib/fakturownia-api'
import type {
  FakturowniaInvoice,
  PaginatedFetchProgress,
} from '@/lib/fakturownia-api'
import { supabase } from '@/lib/supabase'
import { useCompany } from '@/contexts/CompanyContext'
import type { PaymentStatus, InvoiceInsert } from '@/types'
import { trackInvoiceImport } from '@/hooks/useUsageTracker'

// ============================================
// Types
// ============================================

export interface FakturowniaImportParams {
  dateFrom: string
  dateTo: string
  kinds: string[]
  statuses: string[]
  prefixFilter: string | null
}

export type ImportPhase = 'idle' | 'fetching' | 'mapping' | 'syncing' | 'complete' | 'error'

export interface ImportProgress {
  phase: ImportPhase
  current: number
  total: number
  message: string
}

export interface ImportResult {
  imported: number
  updated: number
  skipped: number
  errors: string[]
}

export type ImportAction = 'new' | 'update' | 'skip'

export interface MappedInvoice {
  fakturowniaInvoice: FakturowniaInvoice
  localInvoice: InvoiceInsert
  existingId: string | null
  existingStatus: PaymentStatus | null
  action: ImportAction
  statusChanged: boolean
}

export interface UseFakturowniaImportResult {
  isConfigured: boolean
  isCheckingConfig: boolean
  progress: ImportProgress | null
  preview: MappedInvoice[]
  result: ImportResult | null

  fetchPreview: (params: FakturowniaImportParams) => Promise<void>
  executeImport: () => Promise<void>
  reset: () => void
}

// ============================================
// Status Mapping
// ============================================

/**
 * Map Fakturownia status/kind to Windykator PaymentStatus
 */
function mapFakturowniaStatus(status: string, kind: string): PaymentStatus {
  // Canceled invoices get 'canceled' status
  if (kind === 'canceled') {
    return 'canceled'
  }

  // Map based on payment status
  switch (status.toLowerCase()) {
    case 'paid':
      return 'paid'
    case 'partial':
      return 'partial'
    case 'issued':
    case 'sent':
    default:
      return 'pending'
  }
}

/**
 * Map Fakturownia invoice to local invoice format
 */
function mapFakturowniaInvoice(
  inv: FakturowniaInvoice,
  userId: string,
  companyId: string
): InvoiceInsert {
  return {
    user_id: userId,
    company_id: companyId,
    invoice_number: inv.number,
    issue_date: inv.issue_date,
    due_date: inv.payment_to,
    gross_amount: parseFloat(inv.price_gross) || 0,
    net_amount: parseFloat(inv.price_net) || 0,
    currency: inv.currency || 'PLN',
    buyer_name: inv.buyer_name,
    buyer_nip: inv.buyer_tax_no || null,
    buyer_subaccount: null, // Fakturownia API doesn't provide this directly
    seller_bank_account: null,
    fakturownia_id: inv.id,
    invoice_kind: inv.kind,
    payment_status: mapFakturowniaStatus(inv.status, inv.kind),
  }
}

// ============================================
// Hook
// ============================================

export function useFakturowniaImport(): UseFakturowniaImportResult {
  const { currentCompany } = useCompany()
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [preview, setPreview] = useState<MappedInvoice[]>([])
  const [result, setResult] = useState<ImportResult | null>(null)
  const [isConfigured, setIsConfigured] = useState(true) // Assume configured until API fails
  const [isCheckingConfig, setIsCheckingConfig] = useState(true)

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

  /**
   * Reset all state
   */
  const reset = useCallback(() => {
    setProgress(null)
    setPreview([])
    setResult(null)
  }, [])

  /**
   * Fetch invoices from Fakturownia and prepare preview
   */
  const fetchPreview = useCallback(
    async (params: FakturowniaImportParams) => {
      if (!currentCompany) {
        toast.error('Nie wybrano firmy')
        return
      }

      setProgress({
        phase: 'fetching',
        current: 0,
        total: 0,
        message: 'Pobieranie faktur z Fakturownia...',
      })
      setPreview([])
      setResult(null)

      try {
        // Get current user
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          toast.error('Sesja wygasła. Zaloguj się ponownie.')
          setProgress({ phase: 'error', current: 0, total: 0, message: 'Brak sesji' })
          return
        }

        // Fetch all invoices with pagination
        const allInvoices = await fakturowniaApi.getAllInvoicesPaginated(
          currentCompany.id,
          {
            date_from: params.dateFrom,
            date_to: params.dateTo,
          },
          (fetchProgress: PaginatedFetchProgress) => {
            setProgress({
              phase: 'fetching',
              current: fetchProgress.totalFetched,
              total: 0,
              message: `Pobrano ${fetchProgress.totalFetched} faktur (strona ${fetchProgress.currentPage})...`,
            })
          }
        )

        setProgress({
          phase: 'mapping',
          current: 0,
          total: allInvoices.length,
          message: 'Filtrowanie i mapowanie faktur...',
        })

        // Apply filters
        let filteredInvoices = allInvoices

        // DEBUG: Log what we got from API
        console.log('🔍 DEBUG Import Fakturownia:')
        console.log(`   📅 Zakres dat: ${params.dateFrom} - ${params.dateTo}`)
        console.log(`   📦 Pobrano z API: ${allInvoices.length} faktur`)

        // Log unique kinds and statuses in the data
        const uniqueKinds = [...new Set(allInvoices.map(inv => inv.kind))]
        const uniqueStatuses = [...new Set(allInvoices.map(inv => inv.status))]
        console.log(`   📋 Rodzaje w danych: ${uniqueKinds.join(', ')}`)
        console.log(`   📊 Statusy w danych: ${uniqueStatuses.join(', ')}`)
        console.log(`   🎯 Wybrane filtry - rodzaje: [${params.kinds.join(', ')}], statusy: [${params.statuses.join(', ')}]`)

        // Filter by kinds
        if (params.kinds.length > 0) {
          filteredInvoices = fakturowniaApi.filterInvoicesByKinds(filteredInvoices, params.kinds)
          console.log(`   ➡️ Po filtrze rodzajów: ${filteredInvoices.length}`)
        }

        // Filter by statuses
        if (params.statuses.length > 0) {
          filteredInvoices = fakturowniaApi.filterInvoicesByStatuses(filteredInvoices, params.statuses)
          console.log(`   ➡️ Po filtrze statusów: ${filteredInvoices.length}`)
        }

        // Filter by prefix
        if (params.prefixFilter) {
          filteredInvoices = fakturowniaApi.filterInvoicesByPrefix(filteredInvoices, params.prefixFilter)
          console.log(`   ➡️ Po filtrze prefiksu "${params.prefixFilter}": ${filteredInvoices.length}`)
        }

        console.log(`   ✅ Końcowy wynik: ${filteredInvoices.length} faktur`)

        setProgress({
          phase: 'mapping',
          current: filteredInvoices.length,
          total: allInvoices.length,
          message: `Po filtrach: ${filteredInvoices.length} z ${allInvoices.length} faktur`,
        })

        // Get existing invoices from database - filter by company_id
        const invoiceNumbers = filteredInvoices.map((inv) => inv.number)
        const { data: existingInvoices } = await supabase
          .from('invoices')
          .select('id, invoice_number, payment_status, fakturownia_id')
          .eq('company_id', currentCompany.id)
          .in('invoice_number', invoiceNumbers)

        // Create lookup map
        const existingMap = new Map(
          existingInvoices?.map((inv) => [inv.invoice_number, inv]) || []
        )

        // Map invoices and determine actions
        const mappedInvoices: MappedInvoice[] = filteredInvoices.map((inv) => {
          const localInvoice = mapFakturowniaInvoice(inv, user.id, currentCompany.id)
          const existing = existingMap.get(inv.number)

          let action: ImportAction = 'new'
          let statusChanged = false

          if (existing) {
            const newStatus = localInvoice.payment_status
            const oldStatus = existing.payment_status

            if (newStatus !== oldStatus) {
              action = 'update'
              statusChanged = true
            } else {
              action = 'skip'
            }
          }

          return {
            fakturowniaInvoice: inv,
            localInvoice,
            existingId: existing?.id || null,
            existingStatus: existing?.payment_status || null,
            action,
            statusChanged,
          }
        })

        setPreview(mappedInvoices)
        setProgress({
          phase: 'complete',
          current: mappedInvoices.length,
          total: allInvoices.length,
          message: `Gotowe do importu: ${mappedInvoices.filter((m) => m.action === 'new').length} nowych, ${mappedInvoices.filter((m) => m.action === 'update').length} do aktualizacji`,
        })

        const newCount = mappedInvoices.filter((m) => m.action === 'new').length
        const updateCount = mappedInvoices.filter((m) => m.action === 'update').length
        toast.success(`Pobrano ${mappedInvoices.length} faktur (${newCount} nowych, ${updateCount} do aktualizacji)`)
      } catch (error) {
        console.error('Error fetching preview:', error)
        let message = error instanceof FakturowniaApiError ? error.message : 'Błąd podczas pobierania faktur'

        // Check if API not configured on server
        if (error instanceof FakturowniaApiError && error.statusCode === 500 && message.includes('not configured')) {
          setIsConfigured(false)
          message = 'Fakturownia API nie jest skonfigurowane na serwerze.'
        }

        toast.error(message)
        setProgress({
          phase: 'error',
          current: 0,
          total: 0,
          message,
        })
      }
    },
    [currentCompany]
  )

  /**
   * Execute the import based on preview
   */
  const executeImport = useCallback(async () => {
    if (!currentCompany) {
      toast.error('Nie wybrano firmy')
      return
    }

    if (preview.length === 0) {
      toast.error('Brak faktur do importu')
      return
    }

    setProgress({
      phase: 'syncing',
      current: 0,
      total: preview.length,
      message: 'Importowanie faktur...',
    })

    try {
      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        toast.error('Sesja wygasła. Zaloguj się ponownie.')
        return
      }

      let imported = 0
      let updated = 0
      let skipped = 0
      const errors: string[] = []

      // Process new invoices
      const newInvoices = preview.filter((m) => m.action === 'new')
      if (newInvoices.length > 0) {
        const invoicesToInsert = newInvoices.map((m) => m.localInvoice)
        const { error } = await supabase.from('invoices').insert(invoicesToInsert)

        if (error) {
          console.error('Insert error:', error)
          errors.push(`Błąd podczas dodawania nowych faktur: ${error.message}`)
        } else {
          imported = newInvoices.length
        }
      }

      // Process updates
      const updateInvoices = preview.filter((m) => m.action === 'update')
      for (const inv of updateInvoices) {
        setProgress((prev) => ({
          ...prev!,
          current: imported + updated + skipped,
          message: `Aktualizacja ${inv.localInvoice.invoice_number}...`,
        }))

        // If status changed to paid or canceled, remove existing matches
        if (
          inv.localInvoice.payment_status === 'paid' ||
          inv.localInvoice.payment_status === 'canceled'
        ) {
          await supabase.from('matches').delete().eq('invoice_id', inv.existingId!)
        }

        // Update the invoice
        const { error } = await supabase
          .from('invoices')
          .update({
            payment_status: inv.localInvoice.payment_status,
            invoice_kind: inv.localInvoice.invoice_kind,
            fakturownia_id: inv.localInvoice.fakturownia_id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', inv.existingId!)

        if (error) {
          console.error('Update error:', error)
          errors.push(`Błąd aktualizacji ${inv.localInvoice.invoice_number}: ${error.message}`)
        } else {
          updated++
        }
      }

      // Count skipped
      skipped = preview.filter((m) => m.action === 'skip').length

      const importResult: ImportResult = {
        imported,
        updated,
        skipped,
        errors,
      }

      setResult(importResult)
      setProgress({
        phase: 'complete',
        current: preview.length,
        total: preview.length,
        message: 'Import zakończony',
      })

      // Track invoice usage for billing (only new imports count)
      if (imported > 0) {
        trackInvoiceImport(user.id, imported)
      }

      if (errors.length === 0) {
        toast.success(
          `Import zakończony: ${imported} dodanych, ${updated} zaktualizowanych, ${skipped} pominiętych`
        )
      } else {
        toast.warning(`Import zakończony z ${errors.length} błędami`)
      }
    } catch (error) {
      console.error('Import error:', error)
      toast.error('Nieoczekiwany błąd podczas importu')
      setProgress({
        phase: 'error',
        current: 0,
        total: 0,
        message: 'Błąd importu',
      })
    }
  }, [preview, currentCompany])

  return {
    isConfigured,
    isCheckingConfig,
    progress,
    preview,
    result,
    fetchPreview,
    executeImport,
    reset,
  }
}

export default useFakturowniaImport
