import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// OpenRouter API endpoint
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'

// System prompt for the AI assistant
const SYSTEM_PROMPT = `Jesteś asystentem AI dla systemu InvoiceMatch - aplikacji do zarządzania fakturami i płatnościami.
Odpowiadaj zawsze po polsku, krótko i rzeczowo.

## Źródła danych

Masz dostęp do DWÓCH źródeł danych:

### 1. Lokalna baza danych InvoiceMatch
Zawiera zaimportowane faktury i płatności:
- query_overdue_invoices: faktury po terminie (lokalne)
- query_invoices: wyszukiwanie faktur (lokalne)
- query_payments: płatności bankowe
- get_client_summary: podsumowanie klienta
- get_statistics: statystyki

### 2. API Fakturownia.pl (jeśli skonfigurowane)
Bezpośredni dostęp do konta Fakturownia firmy:
- fakturownia_check_config: sprawdź konfigurację
- fakturownia_get_invoices: pobierz faktury (świeże dane)
- fakturownia_get_paid_invoices: pobierz opłacone faktury z Fakturownia
- fakturownia_search_clients: szukaj klientów
- fakturownia_get_invoice_details: szczegóły faktury

## Ważne!
- Fakturownia NIE MA osobnego endpointu płatności - status płatności jest na fakturach
- Gdy użytkownik pyta o "płatności z Fakturownia" - użyj fakturownia_get_paid_invoices
- Lokalna baza (query_payments) zawiera przelewy bankowe - to inne dane niż status opłacenia faktur

## KRYTYCZNE - Paginacja i fetch_all
Gdy użytkownik pyta o:
- "wszystkie faktury", "ile faktur", "podsumowanie", "statystyki", "suma", "łącznie"
- Konkretny miesiąc/rok z oczekiwaniem pełnych danych

ZAWSZE używaj fetch_all=true! Bez tego otrzymasz tylko pierwszą stronę (max 100 wyników).
Przykład: fakturownia_get_invoices z fetch_all=true pobierze WSZYSTKIE strony.

## Wskazówki
1. Przed użyciem narzędzi Fakturownia - sprawdź konfigurację (fakturownia_check_config)
2. Dane z Fakturownia są zawsze aktualne, lokalne mogą być nieaktualne
3. Gdy Fakturownia nie jest skonfigurowana - poinformuj użytkownika
4. Dla pełnych danych/statystyk ZAWSZE ustawiaj fetch_all=true

Formatuj odpowiedzi czytelnie. Kwoty z dwoma miejscami po przecinku i walutą PLN.
Używaj emoji: 📊 statystyki, ⚠️ zaległości, ✅ pozytywne, 💰 kwoty, 🔗 dane z Fakturownia.`

// Tool definitions for OpenRouter (OpenAI format)
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'query_overdue_invoices',
      description: 'Pobiera listę faktur po terminie płatności (zaległych)',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maksymalna liczba wyników (domyślnie 10)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_invoices',
      description: 'Pobiera faktury wg kryteriów',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['pending', 'paid', 'overdue', 'partial'],
            description: 'Status faktury',
          },
          limit: {
            type: 'number',
            description: 'Maksymalna liczba wyników',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_payments',
      description: 'Pobiera płatności',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maksymalna liczba wyników',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_client_summary',
      description: 'Pobiera podsumowanie zadłużenia dla konkretnego klienta/firmy',
      parameters: {
        type: 'object',
        properties: {
          client_name: {
            type: 'string',
            description: 'Nazwa klienta/firmy (może być częściowa)',
          },
        },
        required: ['client_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_statistics',
      description: 'Pobiera ogólne statystyki faktur i płatności',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
]

// Fakturownia API tools
const FAKTUROWNIA_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'fakturownia_check_config',
      description: 'Sprawdza czy integracja z Fakturownia.pl jest skonfigurowana',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fakturownia_get_invoices',
      description: 'Pobiera faktury z API Fakturownia.pl (świeże dane). Użyj fetch_all=true gdy użytkownik chce WSZYSTKIE faktury (nie tylko pierwszą stronę).',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['this_month', 'last_month', 'last_30_days', 'this_year', 'all'],
            description: 'Okres czasowy (domyślnie this_month)',
          },
          year_month: {
            type: 'string',
            description: 'Konkretny miesiąc w formacie YYYY-MM (np. 2025-12 dla grudnia 2025). Gdy podany, ignoruje parametr period.',
          },
          fetch_all: {
            type: 'boolean',
            description: 'Czy pobrać WSZYSTKIE faktury (wszystkie strony). Ustaw true gdy użytkownik chce pełną listę/sumę/statystyki.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fakturownia_get_paid_invoices',
      description: 'Pobiera opłacone faktury z API Fakturownia.pl. Używaj gdy użytkownik pyta o płatności z Fakturownia.',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['this_month', 'last_month', 'last_30_days', 'this_year', 'all'],
            description: 'Okres czasowy (domyślnie this_month)',
          },
          year_month: {
            type: 'string',
            description: 'Konkretny miesiąc w formacie YYYY-MM (np. 2025-12). Gdy podany, ignoruje parametr period.',
          },
          fetch_all: {
            type: 'boolean',
            description: 'Czy pobrać WSZYSTKIE faktury (wszystkie strony). Ustaw true gdy użytkownik chce pełną listę.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fakturownia_search_clients',
      description: 'Wyszukuje klientów w Fakturownia.pl',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Nazwa lub NIP klienta' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fakturownia_get_invoice_details',
      description: 'Pobiera szczegóły faktury z Fakturownia.pl',
      parameters: {
        type: 'object',
        properties: {
          invoice_id: { type: 'number', description: 'ID faktury w Fakturownia' },
        },
        required: ['invoice_id'],
      },
    },
  },
]

// Combined tools array
const ALL_TOOLS = [...TOOLS, ...FAKTUROWNIA_TOOLS]

// Fakturownia credentials interface
interface FakturowniaCredentials {
  subdomain: string
  apiToken: string
  departmentId: string | null
}

// Get Fakturownia credentials from company_integrations
async function getFakturowniaCredentials(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  companyId: string
): Promise<FakturowniaCredentials | null> {
  const { data: integration, error } = await supabase
    .from('company_integrations')
    .select('fakturownia_enabled, fakturownia_subdomain, fakturownia_api_token_id, fakturownia_department_id')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .single()

  if (error || !integration?.fakturownia_enabled) return null
  if (!integration.fakturownia_subdomain || !integration.fakturownia_api_token_id) return null

  const { data: secretData, error: secretError } = await supabase
    .rpc('get_decrypted_secret', { p_secret_id: integration.fakturownia_api_token_id })

  if (secretError || !secretData) {
    console.error('Failed to decrypt Fakturownia token:', secretError)
    return null
  }

  return {
    subdomain: integration.fakturownia_subdomain,
    apiToken: secretData,
    departmentId: integration.fakturownia_department_id,
  }
}

// Call Fakturownia API
async function callFakturowniaApi(
  credentials: FakturowniaCredentials,
  endpoint: string,
  params: Record<string, string> = {}
): Promise<unknown> {
  const url = new URL(`https://${credentials.subdomain}.fakturownia.pl${endpoint}`)
  url.searchParams.set('api_token', credentials.apiToken)
  if (credentials.departmentId) {
    url.searchParams.set('department_id', credentials.departmentId)
  }
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  // Log URL without the token for debugging
  const logUrl = url.toString().replace(/api_token=[^&]+/, 'api_token=***')
  console.log(`Fakturownia API call: GET ${logUrl}`)

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`Fakturownia API error: ${response.status}`, errorText)
    throw new Error(`Fakturownia API: ${response.status} - ${errorText.substring(0, 100)}`)
  }
  return response.json()
}

// Execute Fakturownia tool
async function executeFakturowniaTool(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  companyId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  if (toolName === 'fakturownia_check_config') {
    const creds = await getFakturowniaCredentials(supabase, userId, companyId)
    if (!creds) return '⚠️ Fakturownia NIE jest skonfigurowana. Użytkownik musi dodać dane w Ustawieniach → Integracje.'
    return `✅ Fakturownia skonfigurowana. Subdomena: ${creds.subdomain}, Dział: ${creds.departmentId || 'domyślny'}`
  }

  const credentials = await getFakturowniaCredentials(supabase, userId, companyId)
  if (!credentials) return '⚠️ Fakturownia nie jest skonfigurowana.'

  try {
    switch (toolName) {
      case 'fakturownia_get_invoices': {
        const period = (args.period as string) || 'this_month'
        const yearMonth = args.year_month as string | undefined
        const fetchAll = args.fetch_all as boolean || false
        const perPage = 100 // Max allowed by Fakturownia
        const params: Record<string, string> = { page: '1', per_page: String(perPage) }

        // Helper to get last day of month
        const getLastDayOfMonth = (year: number, month: number): number => {
          return new Date(year, month, 0).getDate()
        }

        let displayPeriod = period

        // Custom year_month takes precedence - use period=more with date range
        if (yearMonth && /^\d{4}-\d{2}$/.test(yearMonth)) {
          const [year, month] = yearMonth.split('-').map(Number)
          const lastDay = getLastDayOfMonth(year, month)
          params.period = 'more'
          params.date_from = `${yearMonth}-01`
          params.date_to = `${yearMonth}-${String(lastDay).padStart(2, '0')}`
          displayPeriod = yearMonth
        } else if (period === 'this_month') {
          const now = new Date()
          const year = now.getFullYear()
          const month = now.getMonth() + 1
          const lastDay = getLastDayOfMonth(year, month)
          const monthStr = String(month).padStart(2, '0')
          params.period = 'more'
          params.date_from = `${year}-${monthStr}-01`
          params.date_to = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`
          displayPeriod = `${year}-${monthStr}`
        } else if (period === 'last_month') {
          const now = new Date()
          now.setMonth(now.getMonth() - 1)
          const year = now.getFullYear()
          const month = now.getMonth() + 1
          const lastDay = getLastDayOfMonth(year, month)
          const monthStr = String(month).padStart(2, '0')
          params.period = 'more'
          params.date_from = `${year}-${monthStr}-01`
          params.date_to = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`
          displayPeriod = `${year}-${monthStr}`
        } else if (period === 'this_year') {
          const now = new Date()
          const year = now.getFullYear()
          params.period = 'more'
          params.date_from = `${year}-01-01`
          params.date_to = `${year}-12-31`
          displayPeriod = String(year)
        } else if (period === 'all') {
          // No period filter - get all invoices
          displayPeriod = 'wszystkie'
        }
        // 'last_30_days' - use date range
        else if (period === 'last_30_days') {
          const now = new Date()
          const from = new Date(now)
          from.setDate(from.getDate() - 30)
          params.period = 'more'
          params.date_from = from.toISOString().split('T')[0]
          params.date_to = now.toISOString().split('T')[0]
          displayPeriod = 'ostatnie 30 dni'
        }

        // Fetch all pages if requested
        let allInvoices: Array<Record<string, unknown>> = []

        if (fetchAll) {
          console.log(`[TOOL] fakturownia_get_invoices: fetching ALL pages for period=${displayPeriod}`)
          let currentPage = 1
          let hasMore = true
          const maxPages = 20 // Safety limit

          while (hasMore && currentPage <= maxPages) {
            params.page = String(currentPage)
            console.log(`[TOOL] fakturownia_get_invoices: fetching page ${currentPage}`)

            const pageInvoices = await callFakturowniaApi(credentials, '/invoices.json', params) as Array<Record<string, unknown>>

            if (!pageInvoices || !Array.isArray(pageInvoices) || pageInvoices.length === 0) {
              hasMore = false
            } else {
              allInvoices.push(...pageInvoices)
              hasMore = pageInvoices.length === perPage
              currentPage++
            }

            // Small delay between requests
            if (hasMore) await new Promise(r => setTimeout(r, 100))
          }

          console.log(`[TOOL] fakturownia_get_invoices: fetched ${allInvoices.length} total invoices from ${currentPage - 1} pages`)
        } else {
          // Single page fetch
          console.log(`[TOOL] fakturownia_get_invoices: calling API with period=${displayPeriod}, page=1`)
          const invoices = await callFakturowniaApi(credentials, '/invoices.json', params) as Array<Record<string, unknown>>
          if (invoices && Array.isArray(invoices)) {
            allInvoices = invoices
          }
        }

        console.log(`[TOOL] fakturownia_get_invoices: received ${allInvoices.length} invoices`)

        if (allInvoices.length === 0) {
          return `🔗 Brak faktur w Fakturownia dla okresu: ${displayPeriod}. Pobrano z API pomyślnie, ale lista jest pusta.`
        }

        // Calculate statistics
        const total = allInvoices.reduce((sum, inv) => sum + Number(inv.price_gross || 0), 0)
        const paid = allInvoices.filter(inv => inv.status === 'paid')
        const unpaid = allInvoices.filter(inv => inv.status !== 'paid')
        const paidTotal = paid.reduce((sum, inv) => sum + Number(inv.price_gross || 0), 0)
        const unpaidTotal = unpaid.reduce((sum, inv) => sum + Number(inv.price_gross || 0), 0)

        let result = `🔗 Fakturownia (${displayPeriod}) - ${allInvoices.length} faktur:\n\n`
        result += `📊 PODSUMOWANIE:\n`
        result += `• Razem: ${allInvoices.length} faktur na ${total.toFixed(2)} PLN\n`
        result += `• ✅ Opłacone: ${paid.length} faktur na ${paidTotal.toFixed(2)} PLN\n`
        result += `• ⏳ Nieopłacone: ${unpaid.length} faktur na ${unpaidTotal.toFixed(2)} PLN\n\n`

        // Show sample invoices
        const showCount = Math.min(15, allInvoices.length)
        result += `📋 Przykładowe faktury (${showCount} z ${allInvoices.length}):\n`
        allInvoices.slice(0, showCount).forEach((inv, i) => {
          const status = inv.status === 'paid' ? '✅' : inv.status === 'sent' ? '📤' : '⏳'
          result += `${i + 1}. ${status} ${inv.number} - ${inv.buyer_name}: ${Number(inv.price_gross).toFixed(2)} ${inv.currency}\n`
        })
        if (allInvoices.length > showCount) {
          result += `\n... i ${allInvoices.length - showCount} więcej`
        }

        return result
      }

      case 'fakturownia_get_paid_invoices': {
        const period = (args.period as string) || 'this_month'
        const yearMonth = args.year_month as string | undefined
        const fetchAll = args.fetch_all as boolean || true // Default true for paid invoices
        const perPage = 100

        // Helper to get last day of month
        const getLastDayOfMonth = (year: number, month: number): number => {
          return new Date(year, month, 0).getDate()
        }

        const params: Record<string, string> = { page: '1', per_page: String(perPage) }
        let displayPeriod = period

        // Custom year_month takes precedence
        if (yearMonth && /^\d{4}-\d{2}$/.test(yearMonth)) {
          const [year, month] = yearMonth.split('-').map(Number)
          const lastDay = getLastDayOfMonth(year, month)
          params.period = 'more'
          params.date_from = `${yearMonth}-01`
          params.date_to = `${yearMonth}-${String(lastDay).padStart(2, '0')}`
          displayPeriod = yearMonth
        } else if (period === 'this_month') {
          const now = new Date()
          const year = now.getFullYear()
          const month = now.getMonth() + 1
          const lastDay = getLastDayOfMonth(year, month)
          const monthStr = String(month).padStart(2, '0')
          params.period = 'more'
          params.date_from = `${year}-${monthStr}-01`
          params.date_to = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`
          displayPeriod = `${year}-${monthStr}`
        } else if (period === 'last_month') {
          const now = new Date()
          now.setMonth(now.getMonth() - 1)
          const year = now.getFullYear()
          const month = now.getMonth() + 1
          const lastDay = getLastDayOfMonth(year, month)
          const monthStr = String(month).padStart(2, '0')
          params.period = 'more'
          params.date_from = `${year}-${monthStr}-01`
          params.date_to = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`
          displayPeriod = `${year}-${monthStr}`
        } else if (period === 'this_year') {
          const now = new Date()
          const year = now.getFullYear()
          params.period = 'more'
          params.date_from = `${year}-01-01`
          params.date_to = `${year}-12-31`
          displayPeriod = String(year)
        } else if (period === 'all') {
          displayPeriod = 'wszystkie'
        } else if (period === 'last_30_days') {
          const now = new Date()
          const from = new Date(now)
          from.setDate(from.getDate() - 30)
          params.period = 'more'
          params.date_from = from.toISOString().split('T')[0]
          params.date_to = now.toISOString().split('T')[0]
          displayPeriod = 'ostatnie 30 dni'
        }

        // Fetch all pages
        let allInvoices: Array<Record<string, unknown>> = []

        if (fetchAll) {
          console.log(`[TOOL] fakturownia_get_paid_invoices: fetching ALL pages for period=${displayPeriod}`)
          let currentPage = 1
          let hasMore = true
          const maxPages = 20

          while (hasMore && currentPage <= maxPages) {
            params.page = String(currentPage)
            const pageInvoices = await callFakturowniaApi(credentials, '/invoices.json', params) as Array<Record<string, unknown>>

            if (!pageInvoices || !Array.isArray(pageInvoices) || pageInvoices.length === 0) {
              hasMore = false
            } else {
              allInvoices.push(...pageInvoices)
              hasMore = pageInvoices.length === perPage
              currentPage++
            }

            if (hasMore) await new Promise(r => setTimeout(r, 100))
          }
        } else {
          console.log(`[TOOL] fakturownia_get_paid_invoices: calling API with period=${displayPeriod}`)
          const invoices = await callFakturowniaApi(credentials, '/invoices.json', params) as Array<Record<string, unknown>>
          if (invoices && Array.isArray(invoices)) {
            allInvoices = invoices
          }
        }

        if (!allInvoices.length) {
          return `🔗 Brak faktur w Fakturownia dla okresu: ${displayPeriod}`
        }

        // Filter only paid invoices
        const paidInvoices = allInvoices.filter(inv => inv.status === 'paid')
        console.log(`[TOOL] fakturownia_get_paid_invoices: ${paidInvoices.length} paid out of ${allInvoices.length} total`)

        if (paidInvoices.length === 0) {
          return `🔗 Brak opłaconych faktur w Fakturownia dla okresu: ${displayPeriod}. Znaleziono ${allInvoices.length} faktur ogółem, ale żadna nie ma statusu "paid".`
        }

        const total = paidInvoices.reduce((sum, inv) => sum + Number(inv.price_gross || 0), 0)
        const showCount = Math.min(15, paidInvoices.length)

        let result = `🔗 Fakturownia (${displayPeriod}) - ${paidInvoices.length} opłaconych faktur:\n\n`
        result += `📊 Suma opłaconych: ${total.toFixed(2)} PLN\n\n`
        result += `📋 Lista (${showCount} z ${paidInvoices.length}):\n`
        paidInvoices.slice(0, showCount).forEach((inv, i) => {
          result += `${i + 1}. ✅ ${inv.number} - ${inv.buyer_name}: ${Number(inv.price_gross).toFixed(2)} ${inv.currency}\n`
        })
        if (paidInvoices.length > showCount) result += `\n... i ${paidInvoices.length - showCount} więcej`
        return result
      }

      case 'fakturownia_search_clients': {
        const query = args.query as string
        const clients = await callFakturowniaApi(credentials, '/clients.json', { name: query }) as Array<Record<string, unknown>>
        if (!clients?.length) return `🔗 Nie znaleziono klientów dla: "${query}"`

        let result = `🔗 ${clients.length} klientów w Fakturownia:\n\n`
        clients.slice(0, 10).forEach((c, i) => {
          result += `${i + 1}. ${c.name}${c.tax_no ? ` (NIP: ${c.tax_no})` : ''}\n`
        })
        return result
      }

      case 'fakturownia_get_invoice_details': {
        const invoiceId = args.invoice_id as number
        const invoice = await callFakturowniaApi(credentials, `/invoices/${invoiceId}.json`) as Record<string, unknown>
        if (!invoice) return `🔗 Nie znaleziono faktury ID: ${invoiceId}`

        return `🔗 Faktura ${invoice.number}:
• Nabywca: ${invoice.buyer_name}
• NIP: ${invoice.buyer_tax_no || 'brak'}
• Netto: ${Number(invoice.price_net).toFixed(2)} ${invoice.currency}
• Brutto: ${Number(invoice.price_gross).toFixed(2)} ${invoice.currency}
• Data: ${invoice.issue_date}
• Termin: ${invoice.payment_to}
• Status: ${invoice.status}`
      }

      default:
        return `Nieznane narzędzie Fakturownia: ${toolName}`
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`[TOOL ERROR] ${toolName}:`, errorMsg)
    return `⚠️ Błąd podczas pobierania danych z Fakturownia: ${errorMsg}. Sprawdź logi Edge Function.`
  }
}

// Execute tool and return result
async function executeTool(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  companyId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  // Route Fakturownia tools
  if (toolName.startsWith('fakturownia_')) {
    return executeFakturowniaTool(supabase, userId, companyId, toolName, args)
  }

  const limit = (args.limit as number) || 10

  switch (toolName) {
    case 'query_overdue_invoices': {
      const { data, error } = await supabase
        .from('invoices')
        .select('invoice_number, buyer_name, gross_amount, currency, due_date')
        .eq('user_id', userId)
        .eq('company_id', companyId)
        .eq('payment_status', 'overdue')
        .order('gross_amount', { ascending: false })
        .limit(limit)

      if (error) return `Błąd: ${error.message}`
      if (!data || data.length === 0) return 'Brak faktur po terminie płatności.'

      const total = data.reduce((sum, inv) => sum + Number(inv.gross_amount), 0)
      let result = `Znaleziono ${data.length} faktur po terminie (suma: ${total.toFixed(2)} PLN):\n\n`
      data.forEach((inv, i) => {
        result += `${i + 1}. ${inv.invoice_number} - ${inv.buyer_name}: ${Number(inv.gross_amount).toFixed(2)} ${inv.currency} (termin: ${inv.due_date})\n`
      })
      return result
    }

    case 'query_invoices': {
      const status = args.status as string | undefined
      let query = supabase
        .from('invoices')
        .select('invoice_number, buyer_name, gross_amount, currency, payment_status, due_date')
        .eq('user_id', userId)
        .eq('company_id', companyId)

      if (status) {
        query = query.eq('payment_status', status)
      }

      const { data, error } = await query.order('created_at', { ascending: false }).limit(limit)

      if (error) return `Błąd: ${error.message}`
      if (!data || data.length === 0) return 'Brak faktur spełniających kryteria.'

      let result = `Znaleziono ${data.length} faktur:\n\n`
      data.forEach((inv, i) => {
        const statusEmoji = inv.payment_status === 'paid' ? '✅' : inv.payment_status === 'overdue' ? '⚠️' : '⏳'
        result += `${i + 1}. ${statusEmoji} ${inv.invoice_number} - ${inv.buyer_name}: ${Number(inv.gross_amount).toFixed(2)} ${inv.currency}\n`
      })
      return result
    }

    case 'query_payments': {
      const { data, error } = await supabase
        .from('payments')
        .select('transaction_date, sender_name, amount, currency, title')
        .eq('user_id', userId)
        .eq('company_id', companyId)
        .order('transaction_date', { ascending: false })
        .limit(limit)

      if (error) return `Błąd: ${error.message}`
      if (!data || data.length === 0) return 'Brak płatności.'

      const total = data.reduce((sum, p) => sum + Number(p.amount), 0)
      let result = `Ostatnie ${data.length} płatności (suma: ${total.toFixed(2)} PLN):\n\n`
      data.forEach((p, i) => {
        result += `${i + 1}. ${p.transaction_date} - ${p.sender_name}: ${Number(p.amount).toFixed(2)} ${p.currency}\n   "${p.title?.substring(0, 50)}${(p.title?.length || 0) > 50 ? '...' : ''}"\n`
      })
      return result
    }

    case 'get_client_summary': {
      const clientName = args.client_name as string
      const { data, error } = await supabase
        .from('invoices')
        .select('invoice_number, gross_amount, currency, payment_status, due_date')
        .eq('user_id', userId)
        .eq('company_id', companyId)
        .ilike('buyer_name', `%${clientName}%`)

      if (error) return `Błąd: ${error.message}`
      if (!data || data.length === 0) return `Nie znaleziono faktur dla klienta "${clientName}".`

      const totalInvoices = data.length
      const unpaid = data.filter((i) => i.payment_status !== 'paid')
      const overdue = data.filter((i) => i.payment_status === 'overdue')
      const totalUnpaid = unpaid.reduce((sum, i) => sum + Number(i.gross_amount), 0)
      const totalOverdue = overdue.reduce((sum, i) => sum + Number(i.gross_amount), 0)

      let result = `📊 Podsumowanie dla "${clientName}":\n\n`
      result += `• Wszystkich faktur: ${totalInvoices}\n`
      result += `• Niezapłaconych: ${unpaid.length} (${totalUnpaid.toFixed(2)} PLN)\n`
      result += `• Po terminie: ${overdue.length} (${totalOverdue.toFixed(2)} PLN)\n`

      if (overdue.length > 0) {
        result += `\n⚠️ Faktury po terminie:\n`
        overdue.slice(0, 5).forEach((inv) => {
          result += `  - ${inv.invoice_number}: ${Number(inv.gross_amount).toFixed(2)} PLN (termin: ${inv.due_date})\n`
        })
      }

      return result
    }

    case 'get_statistics': {
      const [invoicesResult, paymentsResult] = await Promise.all([
        supabase
          .from('invoices')
          .select('gross_amount, payment_status')
          .eq('user_id', userId)
          .eq('company_id', companyId),
        supabase
          .from('payments')
          .select('amount')
          .eq('user_id', userId)
          .eq('company_id', companyId),
      ])

      if (invoicesResult.error) return `Błąd: ${invoicesResult.error.message}`

      const invoices = invoicesResult.data || []
      const payments = paymentsResult.data || []

      const totalInvoices = invoices.length
      const totalInvoiceValue = invoices.reduce((sum, i) => sum + Number(i.gross_amount), 0)
      const paidCount = invoices.filter((i) => i.payment_status === 'paid').length
      const pendingCount = invoices.filter((i) => i.payment_status === 'pending').length
      const overdueCount = invoices.filter((i) => i.payment_status === 'overdue').length
      const totalPayments = payments.length
      const totalPaymentValue = payments.reduce((sum, p) => sum + Number(p.amount), 0)

      let result = `📊 Statystyki:\n\n`
      result += `📄 Faktury:\n`
      result += `  • Łącznie: ${totalInvoices} (wartość: ${totalInvoiceValue.toFixed(2)} PLN)\n`
      result += `  • ✅ Opłacone: ${paidCount}\n`
      result += `  • ⏳ Oczekujące: ${pendingCount}\n`
      result += `  • ⚠️ Po terminie: ${overdueCount}\n\n`
      result += `💳 Płatności:\n`
      result += `  • Łącznie: ${totalPayments} (wartość: ${totalPaymentValue.toFixed(2)} PLN)\n`

      return result
    }

    default:
      return `Nieznane narzędzie: ${toolName}`
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Health check endpoint
  const url = new URL(req.url)
  if (url.pathname.endsWith('/health')) {
    const apiKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'OPENROUTER_API_KEY nie jest skonfigurowany' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    return new Response(
      JSON.stringify({ status: 'ok' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    // Verify OpenRouter API key is configured
    const openrouterApiKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!openrouterApiKey) {
      return new Response(
        JSON.stringify({ error: 'AI Chat nie jest skonfigurowany. Brak klucza OPENROUTER_API_KEY.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get authorization header
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Brak autoryzacji' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Verify token and get user
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Nieprawidłowy token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const body = await req.json()
    const { message, history, model, companyId } = body

    if (!message || !companyId) {
      return new Response(
        JSON.stringify({ error: 'Brak wymaganych pól: message, companyId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build messages array for OpenRouter
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...(history || []).slice(-10), // Keep last 10 messages for context
      { role: 'user', content: message },
    ]

    // Call OpenRouter API
    const openrouterResponse = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openrouterApiKey}`,
        'HTTP-Referer': 'https://invoicematch.app',
        'X-Title': 'InvoiceMatch AI Chat',
      },
      body: JSON.stringify({
        model: model || 'anthropic/claude-sonnet-4',
        messages,
        tools: ALL_TOOLS,
        max_tokens: 4096,
      }),
    })

    if (!openrouterResponse.ok) {
      const errorText = await openrouterResponse.text()
      console.error('OpenRouter error:', errorText)
      return new Response(
        JSON.stringify({ error: 'Błąd komunikacji z AI. Spróbuj ponownie.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let aiResponse = await openrouterResponse.json()
    let assistantMessage = aiResponse.choices?.[0]?.message

    // Handle tool calls
    while (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0) {
      const toolResults = []

      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name
        const toolArgs = JSON.parse(toolCall.function.arguments || '{}')

        console.log(`Executing tool: ${toolName}`, toolArgs)
        const result = await executeTool(supabase, user.id, companyId, toolName, toolArgs)

        toolResults.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result,
        })
      }

      // Add assistant message with tool calls and tool results to messages
      messages.push(assistantMessage)
      messages.push(...toolResults)

      // Call OpenRouter again with tool results
      const followUpResponse = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openrouterApiKey}`,
          'HTTP-Referer': 'https://invoicematch.app',
          'X-Title': 'InvoiceMatch AI Chat',
        },
        body: JSON.stringify({
          model: model || 'anthropic/claude-sonnet-4',
          messages,
          tools: ALL_TOOLS,
          max_tokens: 4096,
        }),
      })

      if (!followUpResponse.ok) {
        const errorText = await followUpResponse.text()
        console.error('OpenRouter follow-up error:', errorText)
        break
      }

      aiResponse = await followUpResponse.json()
      assistantMessage = aiResponse.choices?.[0]?.message
    }

    const responseMessage = assistantMessage?.content || 'Przepraszam, nie udało się wygenerować odpowiedzi.'

    return new Response(
      JSON.stringify({
        message: responseMessage,
        model: aiResponse.model,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('AI Chat error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Nieznany błąd' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
