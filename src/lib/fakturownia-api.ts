/**
 * Fakturownia API Client
 * Documentation: https://app.fakturownia.pl/api
 *
 * This client provides methods to interact with the Fakturownia API
 * for fetching invoices, clients, and other data.
 *
 * SECURITY: All API calls are proxied through Supabase Edge Function
 * to keep the API token secure (server-side only).
 */

import { supabase } from './supabase'

// Supabase Edge Function URL for Fakturownia proxy
const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fakturownia-proxy`

// Types for Fakturownia API responses
export interface FakturowniaInvoice {
  id: number
  kind: string // 'vat' | 'proforma' | 'correction' | etc.
  number: string
  sell_date: string
  issue_date: string
  payment_to: string // due date
  buyer_name: string
  buyer_tax_no: string // NIP
  buyer_street: string
  buyer_city: string
  buyer_post_code: string
  buyer_country: string
  seller_name: string
  seller_tax_no: string
  currency: string
  price_net: string
  price_gross: string
  price_tax: string
  status: string // 'issued' | 'sent' | 'paid' | 'partial' | etc.
  paid: string // paid amount
  remaining: string // remaining amount
  payment_type: string // 'transfer' | 'cash' | etc.
  description: string
  buyer_email: string
  positions: FakturowniaPosition[]
  // Additional fields
  client_id: number
  created_at: string
  updated_at: string
  token: string
  view_url: string
}

export interface FakturowniaPosition {
  id: number
  name: string
  quantity: string
  unit: string
  price_net: string
  price_gross: string
  tax: string
}

export interface FakturowniaClient {
  id: number
  name: string
  tax_no: string // NIP
  street: string
  city: string
  post_code: string
  country: string
  email: string
  phone: string
  www: string
  bank_account: string // account number
  bank: string // bank name
  note: string
  created_at: string
  updated_at: string
}

export interface FakturowniaProduct {
  id: number
  name: string
  code: string
  price_net: string
  price_gross: string
  tax: string
  unit: string
  description: string
}

export interface FakturowniaPaginatedResponse<T> {
  data: T[]
  total_count: number
  page: number
  per_page: number
}

// Error class for API errors
export class FakturowniaApiError extends Error {
  statusCode?: number
  response?: unknown

  constructor(message: string, statusCode?: number, response?: unknown) {
    super(message)
    this.name = 'FakturowniaApiError'
    this.statusCode = statusCode
    this.response = response
  }
}

// Helper function to make API requests through Edge Function proxy
async function apiRequest<T>(
  endpoint: string,
  companyId: string,
  options: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown } = {}
): Promise<T> {
  try {
    // Get current session for auth token
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !session) {
      throw new FakturowniaApiError('User not authenticated')
    }

    // Get the anon key for Supabase Edge Function authentication
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': anonKey,
      },
      body: JSON.stringify({
        endpoint,
        method: options.method || 'GET',
        body: options.body,
        companyId,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }))
      throw new FakturowniaApiError(
        errorData.error || `API request failed: ${response.statusText}`,
        response.status,
        errorData
      )
    }

    return response.json()
  } catch (error) {
    if (error instanceof FakturowniaApiError) {
      throw error
    }
    throw new FakturowniaApiError(
      `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

// ============================================
// Invoice API Methods
// ============================================

export interface GetInvoicesParams {
  page?: number
  per_page?: number
  period?: string // 'this_month' | 'last_month' | 'this_year' | 'last_year' | 'all'
  date_from?: string // YYYY-MM-DD
  date_to?: string // YYYY-MM-DD
  kind?: string // 'vat' | 'proforma' | 'correction' | etc.
  status?: string // 'issued' | 'sent' | 'paid' | 'partial' | etc.
  client_id?: number
  search?: string // search in invoice number, buyer name, etc.
}

/**
 * Get list of invoices
 * @param companyId - Company ID for credential lookup
 * @param params - Query parameters for filtering
 * @returns Array of invoices
 */
export async function getInvoices(
  companyId: string,
  params: GetInvoicesParams = {}
): Promise<FakturowniaInvoice[]> {
  const queryParams = new URLSearchParams()

  if (params.page) queryParams.set('page', params.page.toString())
  if (params.per_page) queryParams.set('per_page', params.per_page.toString())

  // WAŻNE: Fakturownia API wymaga period=more gdy używamy date_from/date_to
  // Bez tego parametru daty są ignorowane i zwracane są WSZYSTKIE faktury
  if (params.date_from || params.date_to) {
    queryParams.set('period', 'more')
    if (params.date_from) queryParams.set('date_from', params.date_from)
    if (params.date_to) queryParams.set('date_to', params.date_to)
  } else if (params.period) {
    queryParams.set('period', params.period)
  }

  if (params.kind) queryParams.set('kind', params.kind)
  if (params.status) queryParams.set('status', params.status)
  if (params.client_id) queryParams.set('client_id', params.client_id.toString())
  if (params.search) queryParams.set('search', params.search)

  const queryString = queryParams.toString()
  const endpoint = `/invoices.json${queryString ? `?${queryString}` : ''}`

  return apiRequest<FakturowniaInvoice[]>(endpoint, companyId)
}

/**
 * Get a single invoice by ID
 * @param companyId - Company ID for credential lookup
 * @param id - Invoice ID
 * @returns Invoice details
 */
export async function getInvoice(companyId: string, id: number): Promise<FakturowniaInvoice> {
  return apiRequest<FakturowniaInvoice>(`/invoices/${id}.json`, companyId)
}

/**
 * Download invoice PDF
 * @param companyId - Company ID for credential lookup
 * @param id - Invoice ID
 * @returns Blob containing the PDF data
 */
export async function downloadInvoicePdf(companyId: string, id: number): Promise<Blob> {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()

  if (sessionError || !session) {
    throw new FakturowniaApiError('User not authenticated')
  }

  // Get the anon key for Supabase Edge Function authentication
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  const response = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': anonKey,
    },
    body: JSON.stringify({
      endpoint: `/invoices/${id}.pdf`,
      method: 'GET',
      companyId,
    }),
  })

  if (!response.ok) {
    throw new FakturowniaApiError(
      `Failed to download PDF: ${response.statusText}`,
      response.status
    )
  }

  return response.blob()
}

/**
 * Get invoice PDF URL (opens in new tab via download)
 * @param companyId - Company ID for credential lookup
 * @param id - Invoice ID
 * @deprecated Use downloadInvoicePdf() instead for secure access
 */
export async function openInvoicePdf(companyId: string, id: number): Promise<void> {
  const blob = await downloadInvoicePdf(companyId, id)
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  // Clean up after a delay
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

// ============================================
// Client API Methods
// ============================================

export interface GetClientsParams {
  page?: number
  per_page?: number
  search?: string // search in name, NIP, email
}

/**
 * Get list of clients
 * @param companyId - Company ID for credential lookup
 * @param params - Query parameters for filtering
 * @returns Array of clients
 */
export async function getClients(
  companyId: string,
  params: GetClientsParams = {}
): Promise<FakturowniaClient[]> {
  const queryParams = new URLSearchParams()

  if (params.page) queryParams.set('page', params.page.toString())
  if (params.per_page) queryParams.set('per_page', params.per_page.toString())
  if (params.search) queryParams.set('search', params.search)

  const queryString = queryParams.toString()
  const endpoint = `/clients.json${queryString ? `?${queryString}` : ''}`

  return apiRequest<FakturowniaClient[]>(endpoint, companyId)
}

/**
 * Get a single client by ID
 * @param companyId - Company ID for credential lookup
 * @param id - Client ID
 * @returns Client details
 */
export async function getClient(companyId: string, id: number): Promise<FakturowniaClient> {
  return apiRequest<FakturowniaClient>(`/clients/${id}.json`, companyId)
}

// ============================================
// Product API Methods
// ============================================

export interface GetProductsParams {
  page?: number
  per_page?: number
  search?: string
}

/**
 * Get list of products
 * @param companyId - Company ID for credential lookup
 * @param params - Query parameters for filtering
 * @returns Array of products
 */
export async function getProducts(
  companyId: string,
  params: GetProductsParams = {}
): Promise<FakturowniaProduct[]> {
  const queryParams = new URLSearchParams()

  if (params.page) queryParams.set('page', params.page.toString())
  if (params.per_page) queryParams.set('per_page', params.per_page.toString())
  if (params.search) queryParams.set('search', params.search)

  const queryString = queryParams.toString()
  const endpoint = `/products.json${queryString ? `?${queryString}` : ''}`

  return apiRequest<FakturowniaProduct[]>(endpoint, companyId)
}

// ============================================
// Utility Functions
// ============================================

/**
 * Check if the API is configured (server-side)
 * Tests by making a minimal API call
 * @param companyId - Company ID for credential lookup
 * @returns true if API is configured and working
 */
export async function isApiConfigured(companyId: string): Promise<boolean> {
  try {
    await testConnection(companyId)
    return true
  } catch {
    return false
  }
}

/**
 * Test the API connection
 * @param companyId - Company ID for credential lookup
 * @returns true if connection is successful
 */
export async function testConnection(companyId: string): Promise<boolean> {
  try {
    // Try to fetch first page of invoices with just 1 result
    await getInvoices(companyId, { page: 1, per_page: 1 })
    return true
  } catch {
    return false
  }
}

/**
 * Get unpaid invoices (status != 'paid')
 * @param companyId - Company ID for credential lookup
 * @param params - Additional query parameters
 * @returns Array of unpaid invoices
 */
export async function getUnpaidInvoices(
  companyId: string,
  params: Omit<GetInvoicesParams, 'status'> = {}
): Promise<FakturowniaInvoice[]> {
  // Fakturownia doesn't have a direct "unpaid" filter
  // We need to fetch and filter, or use specific statuses
  const invoices = await getInvoices(companyId, {
    ...params,
    kind: 'vat', // Only VAT invoices (not proforma)
  })

  return invoices.filter(inv => inv.status !== 'paid')
}

/**
 * Get overdue invoices (payment_to < today and not paid)
 * @param companyId - Company ID for credential lookup
 * @returns Array of overdue invoices
 */
export async function getOverdueInvoices(companyId: string): Promise<FakturowniaInvoice[]> {
  const today = new Date().toISOString().split('T')[0]
  const invoices = await getUnpaidInvoices(companyId)

  return invoices.filter(inv => inv.payment_to < today)
}

// ============================================
// Invoice Status Change Methods
// ============================================

export type InvoiceStatus = 'issued' | 'sent' | 'paid' | 'partial' | 'rejected'

/**
 * Change invoice status in Fakturownia
 * @param companyId - Company ID for credential lookup
 * @param invoiceId - Fakturownia invoice ID (not local DB ID)
 * @param status - New status to set
 * @returns Updated invoice data
 */
export async function changeInvoiceStatus(
  companyId: string,
  invoiceId: number,
  status: InvoiceStatus
): Promise<FakturowniaInvoice> {
  const endpoint = `/invoices/${invoiceId}/change_status.json?status=${status}`
  return apiRequest<FakturowniaInvoice>(endpoint, companyId, { method: 'POST' })
}

/**
 * Mark invoice as paid in Fakturownia
 * @param companyId - Company ID for credential lookup
 * @param invoiceId - Fakturownia invoice ID (not local DB ID)
 * @returns Updated invoice data
 */
export async function markInvoiceAsPaid(
  companyId: string,
  invoiceId: number
): Promise<FakturowniaInvoice> {
  return changeInvoiceStatus(companyId, invoiceId, 'paid')
}

/**
 * Mark multiple invoices as paid in Fakturownia
 * @param companyId - Company ID for credential lookup
 * @param invoiceIds - Array of Fakturownia invoice IDs
 * @param onProgress - Optional callback for progress updates
 * @returns Results for each invoice (success/failure)
 */
export async function markMultipleInvoicesAsPaid(
  companyId: string,
  invoiceIds: number[],
  onProgress?: (completed: number, total: number, current: { id: number; success: boolean; error?: string }) => void
): Promise<{ id: number; success: boolean; error?: string }[]> {
  const results: { id: number; success: boolean; error?: string }[] = []

  for (let i = 0; i < invoiceIds.length; i++) {
    const id = invoiceIds[i]
    try {
      await markInvoiceAsPaid(companyId, id)
      results.push({ id, success: true })
      onProgress?.(i + 1, invoiceIds.length, { id, success: true })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      results.push({ id, success: false, error: errorMessage })
      onProgress?.(i + 1, invoiceIds.length, { id, success: false, error: errorMessage })
    }
    // Small delay to avoid rate limiting
    if (i < invoiceIds.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }

  return results
}

// ============================================
// Pagination & Filtering for Import
// ============================================

export interface PaginatedFetchProgress {
  currentPage: number
  totalFetched: number
  isComplete: boolean
}

/**
 * Fetch all invoices with pagination
 * Iterates through all pages until no more results
 * @param companyId - Company ID for credential lookup
 * @param params - Base query parameters
 * @param onProgress - Optional callback for progress updates
 * @returns Array of all invoices matching the criteria
 */
export async function getAllInvoicesPaginated(
  companyId: string,
  params: Omit<GetInvoicesParams, 'page' | 'per_page'> = {},
  onProgress?: (progress: PaginatedFetchProgress) => void
): Promise<FakturowniaInvoice[]> {
  const allInvoices: FakturowniaInvoice[] = []
  let page = 1
  const perPage = 100
  let hasMore = true

  while (hasMore) {
    const invoices = await getInvoices(companyId, {
      ...params,
      page,
      per_page: perPage,
    })

    allInvoices.push(...invoices)

    onProgress?.({
      currentPage: page,
      totalFetched: allInvoices.length,
      isComplete: invoices.length < perPage,
    })

    if (invoices.length < perPage) {
      hasMore = false
    } else {
      page++
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  return allInvoices
}

/**
 * Filter invoices by number prefix (client-side filtering)
 * @param invoices - Array of invoices to filter
 * @param prefix - Prefix to filter by (e.g., 'PS', 'FV'), or null for all
 * @returns Filtered array of invoices
 */
export function filterInvoicesByPrefix(
  invoices: FakturowniaInvoice[],
  prefix: string | null
): FakturowniaInvoice[] {
  if (!prefix || prefix.trim() === '') {
    return invoices
  }

  const normalizedPrefix = prefix.trim().toUpperCase()

  return invoices.filter(inv => {
    const invoiceNumber = inv.number.toUpperCase()
    // Check if invoice number starts with the prefix
    // Handle variations like "PS 123", "PS123", "PS/123"
    return (
      invoiceNumber.startsWith(normalizedPrefix + ' ') ||
      invoiceNumber.startsWith(normalizedPrefix + '/') ||
      invoiceNumber.startsWith(normalizedPrefix + '-') ||
      invoiceNumber === normalizedPrefix ||
      // For cases like "PS123" without separator
      (invoiceNumber.startsWith(normalizedPrefix) &&
        /^\d/.test(invoiceNumber.slice(normalizedPrefix.length)))
    )
  })
}

/**
 * Filter invoices by multiple kinds
 * @param invoices - Array of invoices to filter
 * @param kinds - Array of kinds to include (e.g., ['vat', 'proforma', 'canceled'])
 * @returns Filtered array of invoices
 */
export function filterInvoicesByKinds(
  invoices: FakturowniaInvoice[],
  kinds: string[]
): FakturowniaInvoice[] {
  if (!kinds || kinds.length === 0) {
    return invoices
  }
  return invoices.filter(inv => kinds.includes(inv.kind))
}

/**
 * Filter invoices by multiple statuses
 * @param invoices - Array of invoices to filter
 * @param statuses - Array of statuses to include (e.g., ['issued', 'sent', 'paid'])
 * @returns Filtered array of invoices
 */
export function filterInvoicesByStatuses(
  invoices: FakturowniaInvoice[],
  statuses: string[]
): FakturowniaInvoice[] {
  if (!statuses || statuses.length === 0) {
    return invoices
  }
  return invoices.filter(inv => statuses.includes(inv.status))
}

// Export all functions as a namespace for convenience
export const fakturowniaApi = {
  // Config
  isConfigured: isApiConfigured,
  testConnection,

  // Invoices
  getInvoices,
  getInvoice,
  downloadInvoicePdf,
  openInvoicePdf,
  getUnpaidInvoices,
  getOverdueInvoices,

  // Invoice Status
  changeInvoiceStatus,
  markInvoiceAsPaid,
  markMultipleInvoicesAsPaid,

  // Pagination & Filtering
  getAllInvoicesPaginated,
  filterInvoicesByPrefix,
  filterInvoicesByKinds,
  filterInvoicesByStatuses,

  // Clients
  getClients,
  getClient,

  // Products
  getProducts,
}

export default fakturowniaApi
