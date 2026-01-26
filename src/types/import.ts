import type { ImportSource, InvoiceInsert, PaymentInsert } from './database'

// Parsed data before saving to database
export interface ParsedInvoice {
  invoice_number: string
  issue_date: string
  due_date: string
  gross_amount: number
  net_amount: number
  currency: string
  buyer_name: string
  buyer_nip: string | null
}

export interface ParsedPayment {
  transaction_date: string
  amount: number
  currency: string
  sender_name: string
  sender_account: string | null
  title: string
  reference: string | null
}

// Import error details
export interface ImportError {
  row: number
  field: string
  message: string
  value?: string
}

// Parse result (before sending to server)
export interface ParseResult<T> {
  success: boolean
  data: T[]
  errors: ImportError[]
  warnings: string[]
}

// Import response from Edge Function
export interface ImportInvoicesResponse {
  success: boolean
  imported: number
  skipped: number
  errors: ImportError[]
  invoices: InvoiceInsert[]
}

export interface ImportPaymentsResponse {
  success: boolean
  imported: number
  skipped: number
  errors: ImportError[]
  payments: PaymentInsert[]
  detectedSource: ImportSource | 'unknown'
}

// File validation
export interface FileValidation {
  valid: boolean
  error?: string
  detectedFormat?: ImportSource | 'fakturownia' | 'unknown'
  encoding?: string
  rowCount?: number
}

// Import state for UI
export interface ImportState {
  step: 'select' | 'preview' | 'importing' | 'complete' | 'error'
  file: File | null
  preview: ParsedInvoice[] | ParsedPayment[] | null
  progress: number
  result: ImportInvoicesResponse | ImportPaymentsResponse | null
  error: string | null
}
