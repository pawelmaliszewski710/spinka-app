import type { ImportSource } from './database'

// Payment filter options for the UI
export interface PaymentFilters {
  dateFrom?: string
  dateTo?: string
  source?: ImportSource | 'all'
  search?: string
  unmatched?: boolean
}
