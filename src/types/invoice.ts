import type { PaymentStatus } from './database'

// Invoice filter options for the UI
export interface InvoiceFilters {
  status?: PaymentStatus | 'all'
  dateFrom?: string
  dateTo?: string
  search?: string
}
