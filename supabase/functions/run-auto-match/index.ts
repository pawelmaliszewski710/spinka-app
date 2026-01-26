import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Matching algorithm thresholds
const CONFIDENCE_HIGH = 0.85
const CONFIDENCE_MEDIUM = 0.6

// Confidence weights
const WEIGHT_AMOUNT = 0.4
const WEIGHT_INVOICE_NUMBER = 0.3
const WEIGHT_NAME = 0.15
const WEIGHT_NIP = 0.1
const WEIGHT_DATE = 0.05

interface Invoice {
  id: string
  invoice_number: string
  gross_amount: number
  currency: string
  buyer_name: string
  buyer_nip: string | null
  due_date: string
}

interface Payment {
  id: string
  amount: number
  currency: string
  sender_name: string
  title: string
  transaction_date: string
}

interface MatchResult {
  invoiceId: string
  paymentId: string
  confidence: number
  reasons: string[]
}

// String normalization
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[łŁ]/g, 'l')
    .replace(/\s+/g, ' ')
    .trim()
}

// Extract invoice numbers from text
function extractInvoiceNumbers(text: string): string[] {
  const patterns = [
    /\b(FV|FAK|FA|F|FAKT|FAKTURA)[/-]?\d{2,4}[/-]\d{1,5}\b/gi,
    /\b\d{1,5}[/-]\d{2,4}\b/g,
    /\b(FV|FAK|FA|F)\d{6,10}\b/gi,
    /\b(FV|FAK|FA)\s*\d{1,10}\b/gi,
  ]

  const results: string[] = []
  for (const pattern of patterns) {
    const matches = text.match(pattern)
    if (matches) {
      results.push(...matches.map((m) => m.toUpperCase().replace(/\s+/g, '')))
    }
  }
  return [...new Set(results)]
}

// Extract NIP from text
function extractNIP(text: string): string | null {
  const cleaned = text.replace(/NIP[:\s]*/gi, '')
  const nipPattern = /\b(\d{3}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}|\d{3}[\s-]?\d{2}[\s-]?\d{2}[\s-]?\d{3}|\d{10})\b/g
  const matches = cleaned.match(nipPattern)
  if (matches) {
    for (const match of matches) {
      const digits = match.replace(/[\s-]/g, '')
      if (digits.length === 10) return digits
    }
  }
  return null
}

// Calculate match confidence
function calculateMatchConfidence(invoice: Invoice, payment: Payment): MatchResult {
  let confidence = 0
  const reasons: string[] = []

  // Amount matching (40% weight)
  if (invoice.currency === payment.currency) {
    const diff = Math.abs(invoice.gross_amount - payment.amount)
    if (diff < 0.01) {
      confidence += WEIGHT_AMOUNT
      reasons.push('Kwota zgodna (100%)')
    } else if (diff < 1) {
      confidence += WEIGHT_AMOUNT * 0.9
      reasons.push('Kwota niemal zgodna (różnica < 1)')
    } else if (diff / invoice.gross_amount < 0.01) {
      confidence += WEIGHT_AMOUNT * 0.7
      reasons.push('Kwota podobna (różnica < 1%)')
    }
  }

  // Invoice number in payment title (30% weight)
  const invoiceNumbers = extractInvoiceNumbers(payment.title)
  const normalizedInvoiceNum = normalizeString(invoice.invoice_number)

  if (invoiceNumbers.some((num) => normalizeString(num) === normalizedInvoiceNum)) {
    confidence += WEIGHT_INVOICE_NUMBER
    reasons.push('Numer faktury w tytule przelewu')
  } else if (normalizeString(payment.title).includes(normalizedInvoiceNum)) {
    confidence += WEIGHT_INVOICE_NUMBER * 0.8
    reasons.push('Numer faktury częściowo w tytule')
  }

  // Company name matching (15% weight)
  const normalizedBuyer = normalizeString(invoice.buyer_name)
  const normalizedSender = normalizeString(payment.sender_name)

  if (normalizedBuyer === normalizedSender) {
    confidence += WEIGHT_NAME
    reasons.push('Nazwa firmy zgodna')
  } else if (normalizedBuyer.includes(normalizedSender) || normalizedSender.includes(normalizedBuyer)) {
    confidence += WEIGHT_NAME * 0.8
    reasons.push('Nazwa firmy częściowo zgodna')
  }

  // NIP matching (10% weight)
  if (invoice.buyer_nip) {
    const nipInTitle = extractNIP(payment.title)
    const normalizedNip = invoice.buyer_nip.replace(/[\s-]/g, '')
    if (nipInTitle === normalizedNip) {
      confidence += WEIGHT_NIP
      reasons.push('NIP w tytule przelewu')
    }
  }

  // Date proximity (5% weight)
  const dueDate = new Date(invoice.due_date)
  const paymentDate = new Date(payment.transaction_date)
  const daysDiff = Math.abs((dueDate.getTime() - paymentDate.getTime()) / (1000 * 60 * 60 * 24))

  if (daysDiff <= 7) {
    confidence += WEIGHT_DATE
    reasons.push('Płatność blisko terminu')
  } else if (daysDiff <= 14) {
    confidence += WEIGHT_DATE * 0.5
    reasons.push('Płatność w okolicach terminu')
  }

  return {
    invoiceId: invoice.id,
    paymentId: payment.id,
    confidence,
    reasons,
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get user ID from authorization header
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Verify token and get user
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch unmatched invoices and payments
    const [invoicesResult, paymentsResult, matchesResult] = await Promise.all([
      supabase
        .from('invoices')
        .select('id, invoice_number, gross_amount, currency, buyer_name, buyer_nip, due_date')
        .eq('user_id', user.id)
        .eq('payment_status', 'pending'),
      supabase
        .from('payments')
        .select('id, amount, currency, sender_name, title, transaction_date')
        .eq('user_id', user.id),
      supabase
        .from('matches')
        .select('invoice_id, payment_id')
        .eq('user_id', user.id),
    ])

    if (invoicesResult.error) throw invoicesResult.error
    if (paymentsResult.error) throw paymentsResult.error
    if (matchesResult.error) throw matchesResult.error

    const existingMatches = matchesResult.data || []
    const matchedInvoiceIds = new Set(existingMatches.map((m) => m.invoice_id))
    const matchedPaymentIds = new Set(existingMatches.map((m) => m.payment_id))

    const invoices = (invoicesResult.data || []).filter((i) => !matchedInvoiceIds.has(i.id))
    const payments = (paymentsResult.data || []).filter((p) => !matchedPaymentIds.has(p.id))

    // Find matches
    const autoMatches: MatchResult[] = []
    const suggestions: MatchResult[] = []
    const usedPayments = new Set<string>()

    for (const invoice of invoices) {
      let bestMatch: MatchResult | null = null

      for (const payment of payments) {
        if (usedPayments.has(payment.id)) continue

        const result = calculateMatchConfidence(invoice, payment)

        if (!bestMatch || result.confidence > bestMatch.confidence) {
          bestMatch = result
        }
      }

      if (bestMatch) {
        if (bestMatch.confidence >= CONFIDENCE_HIGH) {
          autoMatches.push(bestMatch)
          usedPayments.add(bestMatch.paymentId)
        } else if (bestMatch.confidence >= CONFIDENCE_MEDIUM) {
          suggestions.push(bestMatch)
        }
      }
    }

    // Optionally auto-confirm high confidence matches
    const body = await req.json().catch(() => ({}))
    const autoConfirm = body.autoConfirm === true

    let confirmedCount = 0
    if (autoConfirm && autoMatches.length > 0) {
      for (const match of autoMatches) {
        const { error: insertError } = await supabase.from('matches').insert({
          user_id: user.id,
          invoice_id: match.invoiceId,
          payment_id: match.paymentId,
          confidence_score: match.confidence,
          match_type: 'auto',
          matched_by: user.id,
        })

        if (!insertError) {
          await supabase
            .from('invoices')
            .update({ payment_status: 'paid' })
            .eq('id', match.invoiceId)
          confirmedCount++
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        autoMatches: autoMatches.length,
        suggestions: suggestions.length,
        confirmed: autoConfirm ? confirmedCount : 0,
        matches: autoMatches,
        suggestedMatches: suggestions,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Error running auto-match:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
