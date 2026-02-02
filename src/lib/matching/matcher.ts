import type { Invoice, Payment } from '@/types'
import type { MatchResult, MatchBreakdown, GroupMatchSuggestion, MatchSuggestion } from '@/types'
import { MATCHING_WEIGHTS, CONFIDENCE_THRESHOLDS, RESOURCE_LIMITS } from '@/lib/constants'
import {
  extractMultipleInvoiceNumbers,
  extractNIP,
  extractNIPFromIdIPH,
  normalizeNIP,
  compareCompanyNames,
  matchInvoiceNumberFlexible,
  normalizeInvoiceNumber,
  normalizeString,
  extractSequenceNumber,
  extractDatePart,
  normalizePaymentTitle,
} from './string-utils'

/**
 * Extract last 12 digits from account number for comparison
 * This is used to match buyer_subaccount (full IBAN) with sender_subaccount (last 12 digits from ID IPH)
 */
function extractLast12Digits(account: string | null): string | null {
  if (!account) return null
  // Remove all non-digit characters and get last 12 digits
  const digits = account.replace(/\D/g, '')
  if (digits.length < 12) return digits
  return digits.slice(-12)
}

/**
 * Calculate subaccount match score
 * Compares last 12 digits of buyer_subaccount with sender_subaccount (ID IPH)
 *
 * Example:
 * - Invoice buyer_subaccount: "90 1140 2062 3642 0095 1241 2845" -> last 12: "009512412845"
 * - Payment sender_subaccount (from ID IPH: XX009512412845): "009512412845"
 * - Match! -> score 1.0
 */
function calculateSubaccountScore(
  buyerSubaccount: string | null,
  paymentReceiverSubaccount: string | null | undefined
): number {
  if (!buyerSubaccount || !paymentReceiverSubaccount) return 0

  // Extract last 12 digits from both
  const invoiceLast12 = extractLast12Digits(buyerSubaccount)
  const paymentLast12 = extractLast12Digits(paymentReceiverSubaccount)

  if (!invoiceLast12 || !paymentLast12) return 0

  // Exact match of last 12 digits
  if (invoiceLast12 === paymentLast12) return 1.0

  // Partial match - one ends with the other (for shorter IDs)
  if (invoiceLast12.endsWith(paymentLast12) || paymentLast12.endsWith(invoiceLast12)) {
    return 0.9
  }

  return 0
}

/**
 * Calculate amount match score
 * Exact match = 1.0, within 1% = 0.9, within 5% = 0.7
 */
function calculateAmountScore(invoiceAmount: number, paymentAmount: number): number {
  if (invoiceAmount === paymentAmount) return 1.0

  const diff = Math.abs(invoiceAmount - paymentAmount)
  const percentDiff = diff / invoiceAmount

  if (percentDiff <= 0.001) return 0.99 // Within 0.1% (rounding errors)
  if (percentDiff <= 0.01) return 0.9 // Within 1%
  if (percentDiff <= 0.05) return 0.7 // Within 5%
  if (percentDiff <= 0.1) return 0.5 // Within 10%

  return 0
}

/**
 * Calculate invoice number match score
 * Check if any invoice number pattern is found in payment title or extended_title
 * Handles flexible matching for variations like:
 * - PS 23/12/2025 vs PS 23_12_2025 (different separators)
 * - PS 52/01/2026 vs PS 52 /01/2026 (extra spaces)
 * - PS 195/12/2025 vs PS195 /12/2025 (missing/extra spaces)
 * Also handles multiple invoices in one payment (separated by ; or ,)
 */
function calculateInvoiceNumberScore(
  invoiceNumber: string,
  paymentTitle: string,
  paymentExtendedTitle?: string | null
): number {
  // DEBUG: Log for problematic cases (PS 10, PS 17, PS 37)
  const debugInvoices = ['10/12', '17/12', '37/12']
  const isDebugCase = debugInvoices.some(pattern => invoiceNumber.includes(pattern))
  if (isDebugCase) {
    console.log(`\n📊 DEBUG calculateInvoiceNumberScore:`)
    console.log(`   invoiceNumber: "${invoiceNumber}"`)
    console.log(`   paymentTitle: "${paymentTitle.substring(0, 100)}..."`)
    if (paymentExtendedTitle) {
      console.log(`   paymentExtendedTitle: "${paymentExtendedTitle.substring(0, 100)}..."`)
    }
  }

  // Combine title and extended_title for searching
  const rawSearchText = paymentExtendedTitle
    ? `${paymentTitle} ${paymentExtendedTitle}`
    : paymentTitle

  // Normalize payment title to remove bank-inserted spaces in invoice numbers
  // e.g., "PS 1 7/12/2025" → "PS 17/12/2025", "PS 17/12/ 2025" → "PS 17/12/2025"
  const searchText = normalizePaymentTitle(rawSearchText)

  if (isDebugCase) {
    console.log(`   rawSearchText: "${rawSearchText}"`)
    console.log(`   searchText (normalized): "${searchText}"`)
  }

  // 1. Try flexible matching first (handles separator variations)
  const flexibleScore = matchInvoiceNumberFlexible(invoiceNumber, searchText)
  if (isDebugCase) {
    console.log(`   Step 1 - flexibleScore: ${flexibleScore}`)
  }
  if (flexibleScore >= 0.9) {
    if (isDebugCase) console.log(`   ✓ Returning flexibleScore: ${flexibleScore}`)
    return flexibleScore
  }

  // 2. Extract all invoice numbers from the payment (handles multiple invoices)
  const extractedNumbers = extractMultipleInvoiceNumbers(searchText)
  if (isDebugCase) {
    console.log(`   Step 2 - extractedNumbers: ${JSON.stringify(extractedNumbers)}`)
  }

  // Normalize our invoice number for comparison
  const normalizedInvoiceNumber = normalizeInvoiceNumber(invoiceNumber)

  for (const extracted of extractedNumbers) {
    if (isDebugCase) {
      console.log(`   Processing extracted: "${extracted}"`)
    }
    // Check with flexible matching
    const extractedScore = matchInvoiceNumberFlexible(invoiceNumber, extracted)
    if (isDebugCase) {
      console.log(`   extractedScore: ${extractedScore}`)
    }
    if (extractedScore >= 0.9) {
      if (isDebugCase) console.log(`   ✓ Returning extractedScore: ${extractedScore}`)
      return extractedScore
    }

    // Check normalized comparison
    const normalizedExtracted = normalizeInvoiceNumber(extracted)
    if (isDebugCase) {
      console.log(`   normalizedExtracted: "${normalizedExtracted}" vs normalizedInvoiceNumber: "${normalizedInvoiceNumber}"`)
    }
    if (normalizedExtracted === normalizedInvoiceNumber) {
      if (isDebugCase) console.log(`   ✓ Exact normalized match! Returning 0.95`)
      return 0.95
    }

    // NAPRAWIONE: Porównaj numery sekwencyjne i daty dla formatów typu NN/MM/YYYY
    // Przykłady błędów które to naprawia:
    // - 37/12/2025 vs 7/12/2025 (różne sekwencje: 37 vs 7)
    // - 13/01/2026 vs 13/12/2025 (różne daty: 01/2026 vs 12/2025)
    const invoiceSeq = extractSequenceNumber(invoiceNumber)
    const extractedSeq = extractSequenceNumber(extracted)
    const invoiceDatePart = extractDatePart(invoiceNumber)
    const extractedDatePart = extractDatePart(extracted)

    if (isDebugCase) {
      console.log(`   invoiceSeq: "${invoiceSeq}", extractedSeq: "${extractedSeq}"`)
      console.log(`   invoiceDatePart: "${invoiceDatePart}", extractedDatePart: "${extractedDatePart}"`)
    }

    // Jeśli OBA mają numer sekwencyjny i datę - OBIE części muszą się zgadzać!
    if (invoiceSeq && extractedSeq && invoiceDatePart && extractedDatePart) {
      // Pełne dopasowanie: ta sama sekwencja I ta sama data
      if (invoiceSeq === extractedSeq && invoiceDatePart === extractedDatePart) {
        if (isDebugCase) console.log(`   ✓ Seq and date match! Returning 0.95`)
        return 0.95
      }
      // Jeśli tytuł płatności wskazuje konkretny numer faktury (sekwencja + data),
      // ale się nie zgadza z fakturą - to płatność za INNĄ fakturę!
      // Np. płatność "F-ra 13/12/2025" NIE pasuje do faktury "13/01/2026"
      if (isDebugCase) console.log(`   ✗ Seq/date mismatch - continuing to next extracted`)
      continue // Przejdź do następnego extracted number
    }

    // Fallback: tylko jeśli jeden jest PREFIKSEM drugiego (nie dowolny substring)
    if (normalizedExtracted.startsWith(normalizedInvoiceNumber) ||
        normalizedInvoiceNumber.startsWith(normalizedExtracted)) {
      if (isDebugCase) console.log(`   Prefix match! Returning 0.1`)
      return 0.1  // Bardzo niski score - tylko prefix pasuje
    }
  }

  // 3. Fallback: Check for EXACT digit match only (nie używamy includes() bo powoduje fałszywe pozytywne!)
  // Przykład problemu: "37122025".includes("7122025") = TRUE (błąd!)
  const invoiceDigits = invoiceNumber.replace(/\D/g, '')
  if (isDebugCase) {
    console.log(`   Step 3 Fallback - invoiceDigits: "${invoiceDigits}"`)
  }
  if (invoiceDigits.length >= 4) {
    const searchTextDigits = searchText.replace(/\D/g, '')
    if (isDebugCase) {
      console.log(`   searchTextDigits: "${searchTextDigits}"`)
      console.log(`   EXACT match: ${searchTextDigits === invoiceDigits}`)
    }
    // Tylko DOKŁADNE dopasowanie cyfr (nie includes!)
    if (searchTextDigits === invoiceDigits) {
      if (isDebugCase) console.log(`   ✓ EXACT digits match! Returning 0.7`)
      return 0.7 // Numbers match exactly
    }

    // Sprawdź ostatnie 4 cyfry (rok) - ale tylko jeśli są IDENTYCZNE i nie ma konfliktu dat
    // To pomaga dopasować faktury gdy tytuł zawiera tylko rok
    const lastDigits = invoiceDigits.slice(-4)
    const searchLastDigits = searchTextDigits.slice(-4)
    if (isDebugCase) {
      console.log(`   lastDigits (invoice): "${lastDigits}"`)
      console.log(`   searchLastDigits: "${searchLastDigits}"`)
    }
    // Tylko jeśli ostatnie 4 cyfry są IDENTYCZNE (ten sam rok)
    // I tytuł nie zawiera pełnego numeru faktury w innym formacie (już sprawdzone wcześniej)
    if (lastDigits === searchLastDigits && lastDigits.length === 4) {
      if (isDebugCase) console.log(`   ✓ Last 4 digits (year) match! Returning 0.1`)
      return 0.1 // Minimalny score - tylko rok się zgadza
    }
  }

  if (isDebugCase) console.log(`   ✗ No match found, returning 0`)
  return 0
}

/**
 * Calculate name match score using fuzzy matching
 */
function calculateNameScore(buyerName: string, senderName: string): number {
  return compareCompanyNames(buyerName, senderName)
}

/**
 * Calculate NIP match score
 * Checks NIP in: ID IPH (priority), title, extended_title
 */
function calculateNIPScore(
  buyerNip: string | null,
  paymentTitle: string,
  extendedTitle?: string | null
): number {
  if (!buyerNip) return 0

  const normalizedBuyerNip = normalizeNIP(buyerNip)
  if (!normalizedBuyerNip) return 0

  // PRIORITY: Check NIP from ID IPH in extended_title (most reliable for mBank Corporate)
  // Format: "ID IPH: XX005832141328" -> NIP is last 10 digits: "5832141328"
  if (extendedTitle) {
    const idIphNip = extractNIPFromIdIPH(extendedTitle)
    if (idIphNip === normalizedBuyerNip) {
      return 1.0
    }
  }

  // Check in payment title
  const extractedNip = extractNIP(paymentTitle)
  if (extractedNip === normalizedBuyerNip) {
    return 1.0
  }

  // Check in extended title (fallback for other NIP formats)
  if (extendedTitle) {
    const extNip = extractNIP(extendedTitle)
    if (extNip === normalizedBuyerNip) {
      return 1.0
    }
  }

  // Check if NIP digits appear in title (partial match)
  if (paymentTitle.includes(normalizedBuyerNip)) {
    return 0.9
  }

  return 0
}

/**
 * Calculate date proximity score
 * Payment should ideally be around due date
 */
function calculateDateScore(dueDate: string, paymentDate: string): number {
  const due = new Date(dueDate)
  const payment = new Date(paymentDate)

  const daysDiff = Math.abs(
    (payment.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)
  )

  if (daysDiff <= 8) return 1.0 // Within ~1 week of due date
  if (daysDiff <= 13) return 0.9 // Within ~2 weeks
  if (daysDiff <= 19) return 0.8 // Within ~3 weeks
  if (daysDiff <= 35) return 0.6 // Within ~1 month
  if (daysDiff <= 65) return 0.4 // Within ~2 months
  if (daysDiff <= 95) return 0.2 // Within ~3 months

  return 0.1 // More than 3 months
}

/**
 * Calculate date proximity score for subaccount verification
 * Returns score based on how close payment is to invoice due date
 * For subaccount matching: <14 days = ideal, 14-30 days = acceptable
 */
function calculateDateProximityForSubaccount(dueDate: string, paymentDate: string): {
  score: number
  days: number
  isAcceptable: boolean
} {
  const due = new Date(dueDate)
  const payment = new Date(paymentDate)
  const daysDiff = Math.abs((payment.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))

  if (daysDiff <= 14) {
    return { score: 1.0, days: daysDiff, isAcceptable: true }
  }
  if (daysDiff <= 30) {
    return { score: 0.8, days: daysDiff, isAcceptable: true }
  }
  return { score: 0.5, days: daysDiff, isAcceptable: false }
}

/**
 * Calculate overall match confidence between an invoice and payment
 * Extended Payment type to include sender_subaccount and extended_title
 */
export function calculateMatchConfidence(
  invoice: Invoice,
  payment: Payment & { sender_subaccount?: string | null; extended_title?: string | null },
  debug: boolean = false
): MatchResult {
  // Calculate subaccount score first (highest priority)
  const subaccountScore = calculateSubaccountScore(
    invoice.buyer_subaccount,
    payment.sender_subaccount
  )

  if (debug) {
    console.log(`\n🔍 Porównuję: Faktura ${invoice.invoice_number} ↔ Płatność "${payment.title.substring(0, 50)}..."`)
    console.log(`   Subkonto faktury: ${invoice.buyer_subaccount || 'BRAK'}`)
    console.log(`   Subkonto płatności: ${payment.sender_subaccount || 'BRAK'}`)
    console.log(`   Subaccount score: ${subaccountScore}`)
  }

  // Calculate all individual scores first (needed for subaccount verification)
  const amountScore = calculateAmountScore(invoice.gross_amount, payment.amount)
  const invoiceNumberScore = calculateInvoiceNumberScore(
    invoice.invoice_number,
    payment.title,
    payment.extended_title
  )
  const nameScore = calculateNameScore(invoice.buyer_name, payment.sender_name)
  const nipScore = calculateNIPScore(invoice.buyer_nip, payment.title, payment.extended_title)
  const dateScore = calculateDateScore(invoice.due_date, payment.transaction_date)

  // If subaccount matches perfectly, we need additional verification
  // Subaccount identifies the contractor, but the same contractor sends monthly invoices
  // Need: invoice number OR exact amount OR date within 30 days
  if (subaccountScore >= 1.0) {
    const dateProximity = calculateDateProximityForSubaccount(invoice.due_date, payment.transaction_date)

    const hasInvoiceNumberMatch = invoiceNumberScore >= 0.9
    const hasExactAmountMatch = amountScore >= 0.99
    const hasDateProximityMatch = dateProximity.isAcceptable

    const breakdown: MatchBreakdown = {
      subaccount: subaccountScore,
      amount: amountScore,
      invoiceNumber: invoiceNumberScore,
      name: nameScore,
      nip: nipScore,
      date: dateScore,
    }

    if (debug) {
      console.log(`   📊 Weryfikacja subkonta (kontrahent zidentyfikowany):`)
      console.log(`      - Nr faktury w tytule: ${hasInvoiceNumberMatch ? '✅' : '❌'} (score: ${invoiceNumberScore.toFixed(2)})`)
      console.log(`      - Dokładna kwota: ${hasExactAmountMatch ? '✅' : '❌'} (score: ${amountScore.toFixed(2)})`)
      console.log(`      - Data blisko (≤30 dni): ${hasDateProximityMatch ? '✅' : '❌'} (${dateProximity.days.toFixed(0)} dni)`)
    }

    // 100% confidence only if subaccount + (invoice number OR exact amount)
    if (hasInvoiceNumberMatch) {
      if (debug) console.log(`   ✅ PEWNE DOPASOWANIE: Subkonto + numer faktury`)
      return {
        invoiceId: invoice.id,
        paymentId: payment.id,
        confidence: 1.0,
        breakdown,
        reasons: [
          'Dopasowanie po subkoncie (kontrahent)',
          'Numer faktury znaleziony w tytule',
          `Kwota: ${payment.amount.toFixed(2)} PLN`,
        ],
      }
    }

    if (hasExactAmountMatch && hasDateProximityMatch) {
      if (debug) console.log(`   ✅ PEWNE DOPASOWANIE: Subkonto + dokładna kwota + data blisko`)
      return {
        invoiceId: invoice.id,
        paymentId: payment.id,
        confidence: 1.0,
        breakdown,
        reasons: [
          'Dopasowanie po subkoncie (kontrahent)',
          `Kwota dokładnie zgodna: ${payment.amount.toFixed(2)} PLN`,
          `Płatność ${dateProximity.days.toFixed(0)} dni od terminu`,
        ],
      }
    }

    // Subaccount match without strong verification = high suggestion (not auto-match)
    // Confidence based on additional criteria
    let subaccountConfidence = 0.7 // Base for subaccount match without verification

    if (hasExactAmountMatch) {
      subaccountConfidence += 0.15 // Exact amount but date far
    } else if (amountScore >= 0.9) {
      subaccountConfidence += 0.1 // Close amount
    }

    if (hasDateProximityMatch) {
      subaccountConfidence += dateProximity.score * 0.1 // Date proximity bonus
    }

    if (debug) {
      console.log(`   💡 SUGESTIA: Subkonto pasuje, ale brak dodatkowej weryfikacji`)
      console.log(`      Confidence: ${subaccountConfidence.toFixed(2)}`)
    }

    return {
      invoiceId: invoice.id,
      paymentId: payment.id,
      confidence: Math.min(0.84, subaccountConfidence), // Cap at 0.84 (below auto-match threshold)
      breakdown,
      reasons: [
        'Dopasowanie po subkoncie (kontrahent)',
        'Brak numeru faktury w tytule - wymaga weryfikacji',
        `Kwota: ${payment.amount.toFixed(2)} PLN`,
      ],
    }
  }

  // Scores already calculated above for subaccount verification
  // Now log them for non-subaccount matches
  if (debug) {
    console.log(`   📊 Wyniki poszczególnych kryteriów:`)
    console.log(`      - Kwota: ${amountScore.toFixed(2)} (faktura: ${invoice.gross_amount}, płatność: ${payment.amount})`)
    console.log(`      - Nr faktury: ${invoiceNumberScore.toFixed(2)} (szukam "${invoice.invoice_number}" w tytule/extended)`)
    if (payment.extended_title) {
      console.log(`        Tytuł: "${payment.title.substring(0, 50)}..."`)
      console.log(`        Extended: "${payment.extended_title.substring(0, 80)}..."`)
    } else {
      console.log(`        Tytuł: "${payment.title}"`)
    }
    console.log(`      - Nazwa: ${nameScore.toFixed(2)} (nabywca: "${invoice.buyer_name}", nadawca: "${payment.sender_name}")`)
    console.log(`      - NIP: ${nipScore.toFixed(2)}`)
    console.log(`      - Data: ${dateScore.toFixed(2)}`)
  }

  // RULE: If invoice number in title + amount matches + name matches = 100% confidence
  // This is considered a definitive match
  if (invoiceNumberScore >= 0.9 && amountScore >= 0.9 && nameScore >= 0.5) {
    const breakdown: MatchBreakdown = {
      subaccount: subaccountScore,
      amount: amountScore,
      invoiceNumber: invoiceNumberScore,
      name: nameScore,
      nip: nipScore,
      date: dateScore,
    }

    if (debug) {
      console.log(`   ✅ PEWNE DOPASOWANIE: Nr faktury + kwota + nazwa = 100%`)
    }

    return {
      invoiceId: invoice.id,
      paymentId: payment.id,
      confidence: 1.0,
      breakdown,
      reasons: [
        'Numer faktury znaleziony w tytule',
        `Kwota zgodna: ${payment.amount.toFixed(2)} PLN`,
        'Nazwa kontrahenta zgodna',
      ],
    }
  }

  // RULE: If invoice number in title + amount matches + name somewhat matches = high confidence
  // UWAGA: Nazwa musi pasować przynajmniej częściowo (>= 0.5), żeby dać auto-match
  if (invoiceNumberScore >= 0.9 && amountScore >= 0.9 && nameScore >= 0.5) {
    const breakdown: MatchBreakdown = {
      subaccount: subaccountScore,
      amount: amountScore,
      invoiceNumber: invoiceNumberScore,
      name: nameScore,
      nip: nipScore,
      date: dateScore,
    }

    if (debug) {
      console.log(`   ✅ WYSOKIE DOPASOWANIE: Nr faktury + kwota + nazwa = 95%`)
    }

    return {
      invoiceId: invoice.id,
      paymentId: payment.id,
      confidence: 0.95,
      breakdown,
      reasons: [
        'Numer faktury znaleziony w tytule',
        `Kwota zgodna: ${payment.amount.toFixed(2)} PLN`,
        'Nazwa nadawcy pasuje do nabywcy',
      ],
    }
  }

  // RULE: If invoice number + amount matches but name doesn't = only suggestion (not auto-match)
  if (invoiceNumberScore >= 0.9 && amountScore >= 0.9 && nameScore < 0.5) {
    const breakdown: MatchBreakdown = {
      subaccount: subaccountScore,
      amount: amountScore,
      invoiceNumber: invoiceNumberScore,
      name: nameScore,
      nip: nipScore,
      date: dateScore,
    }

    if (debug) {
      console.log(`   ⚠️ SUGESTIA: Nr faktury + kwota pasują, ale nazwa NIE (${nameScore.toFixed(2)} < 0.5)`)
    }

    return {
      invoiceId: invoice.id,
      paymentId: payment.id,
      confidence: 0.80, // Below auto-match threshold (0.85)
      breakdown,
      reasons: [
        'Numer faktury znaleziony w tytule',
        `Kwota zgodna: ${payment.amount.toFixed(2)} PLN`,
        '⚠️ Nazwa nadawcy nie zgadza się z nabywcą - wymaga weryfikacji',
      ],
    }
  }

  // RULE: If invoice number exactly in title + name matches strongly = high confidence
  // This handles cases where payment title explicitly mentions invoice number (e.g., "Faktura numer PS 95/11/2025")
  // Even if amount differs by up to 10% (could be interest, fees, partial payment, or invoice correction)
  if (invoiceNumberScore >= 0.95 && nameScore >= 0.8 && amountScore >= 0.5) {
    const breakdown: MatchBreakdown = {
      subaccount: subaccountScore,
      amount: amountScore,
      invoiceNumber: invoiceNumberScore,
      name: nameScore,
      nip: nipScore,
      date: dateScore,
    }

    // Calculate adjusted confidence based on amount match
    // Base 0.85 for exact invoice number + name, up to 0.95 based on amount closeness
    const adjustedConfidence = 0.85 + (amountScore - 0.5) * 0.25 // 0.85-0.975 range

    if (debug) {
      console.log(`   ✅ DOPASOWANIE PO NUMERZE FAKTURY: Nr faktury dokładnie + nazwa zgodna (kwota ${((1 - amountScore) * 100).toFixed(1)}% różnicy)`)
      console.log(`      Confidence: ${adjustedConfidence.toFixed(2)}`)
    }

    const amountDiff = payment.amount - invoice.gross_amount
    const amountDiffStr = amountDiff > 0 ? `+${amountDiff.toFixed(2)}` : amountDiff.toFixed(2)

    return {
      invoiceId: invoice.id,
      paymentId: payment.id,
      confidence: Math.min(adjustedConfidence, 0.95),
      breakdown,
      reasons: [
        'Numer faktury dokładnie zgodny w tytule przelewu',
        'Nazwa nadawcy zgodna z nabywcą',
        `Kwota: ${payment.amount.toFixed(2)} PLN (${amountDiffStr} PLN różnicy)`,
      ],
    }
  }

  const breakdown: MatchBreakdown = {
    subaccount: subaccountScore,
    amount: amountScore,
    invoiceNumber: invoiceNumberScore,
    name: nameScore,
    nip: nipScore,
    date: dateScore,
  }

  // Calculate weighted confidence (without subaccount since it didn't match fully)
  let confidence =
    amountScore * MATCHING_WEIGHTS.AMOUNT +
    invoiceNumberScore * MATCHING_WEIGHTS.INVOICE_NUMBER +
    nameScore * MATCHING_WEIGHTS.NAME +
    nipScore * MATCHING_WEIGHTS.NIP +
    dateScore * MATCHING_WEIGHTS.DATE

  if (debug) {
    console.log(`   🧮 Obliczanie confidence:`)
    console.log(`      kwota*${MATCHING_WEIGHTS.AMOUNT} = ${(amountScore * MATCHING_WEIGHTS.AMOUNT).toFixed(3)}`)
    console.log(`      nrFaktury*${MATCHING_WEIGHTS.INVOICE_NUMBER} = ${(invoiceNumberScore * MATCHING_WEIGHTS.INVOICE_NUMBER).toFixed(3)}`)
    console.log(`      nazwa*${MATCHING_WEIGHTS.NAME} = ${(nameScore * MATCHING_WEIGHTS.NAME).toFixed(3)}`)
    console.log(`      nip*${MATCHING_WEIGHTS.NIP} = ${(nipScore * MATCHING_WEIGHTS.NIP).toFixed(3)}`)
    console.log(`      data*${MATCHING_WEIGHTS.DATE} = ${(dateScore * MATCHING_WEIGHTS.DATE).toFixed(3)}`)
    console.log(`      SUMA = ${confidence.toFixed(3)}`)
  }

  // If there's a partial subaccount match, boost confidence
  if (subaccountScore > 0) {
    confidence = Math.min(1.0, confidence + subaccountScore * 0.3)
    if (debug) {
      console.log(`      + boost za subkonto: ${confidence.toFixed(3)}`)
    }
  }

  // Generate human-readable reasons
  const reasons: string[] = []

  if (subaccountScore > 0 && subaccountScore < 1.0) {
    reasons.push('Częściowe dopasowanie subkonta')
  }

  if (amountScore >= 0.9) {
    reasons.push(`Kwota zgodna: ${payment.amount.toFixed(2)} PLN`)
  } else if (amountScore >= 0.5) {
    reasons.push(`Kwota zbliżona: ${payment.amount.toFixed(2)} vs ${invoice.gross_amount.toFixed(2)} PLN`)
  }

  if (invoiceNumberScore >= 0.9) {
    reasons.push(`Numer faktury znaleziony w tytule`)
  } else if (invoiceNumberScore >= 0.6) {
    reasons.push(`Częściowe dopasowanie numeru faktury`)
  }

  if (nameScore >= 0.8) {
    reasons.push(`Nazwa nadawcy zgodna z nabywcą`)
  } else if (nameScore >= 0.5) {
    reasons.push(`Podobna nazwa nadawcy`)
  }

  if (nipScore >= 0.9) {
    reasons.push(`NIP znaleziony w tytule przelewu`)
  }

  if (dateScore >= 0.8) {
    reasons.push(`Płatność blisko terminu`)
  }

  let finalConfidence = Math.round(confidence * 100) / 100

  // === BLOKADA: Nazwa musi pasować do auto-match (z wyjątkiem gdy NIP pasuje) ===
  // Jeśli nazwa nadawcy NIE pasuje do nabywcy faktury (score < 0.5),
  // NIGDY nie dawaj auto-match, nawet jeśli inne kryteria pasują.
  // WYJĄTEK: Jeśli NIP pasuje (nipScore >= 0.9), to znaczy że to ta sama firma/jednostka
  // (np. DOM POMOCY SPOŁECZNEJ KOMBATANT to jednostka MIASTA STOŁECZNEGO WARSZAWY)
  // i blokada nie powinna być stosowana.
  const NAME_MATCH_THRESHOLD_FOR_AUTO = 0.5
  const NIP_OVERRIDE_THRESHOLD = 0.9
  if (nameScore < NAME_MATCH_THRESHOLD_FOR_AUTO && nipScore < NIP_OVERRIDE_THRESHOLD && finalConfidence >= CONFIDENCE_THRESHOLDS.HIGH) {
    // Obniż confidence poniżej progu auto-match
    const adjustedConfidence = CONFIDENCE_THRESHOLDS.HIGH - 0.01 // 0.84

    if (debug) {
      console.log(`   ⚠️ BLOKADA: Nazwa nie pasuje (${nameScore.toFixed(2)} < 0.5) i NIP nie znaleziony`)
      console.log(`      Confidence obniżone: ${finalConfidence} → ${adjustedConfidence}`)
    }

    reasons.push('⚠️ Nazwa nadawcy nie zgadza się z nabywcą - wymaga weryfikacji')
    finalConfidence = adjustedConfidence
  } else if (nameScore < NAME_MATCH_THRESHOLD_FOR_AUTO && nipScore >= NIP_OVERRIDE_THRESHOLD && finalConfidence >= CONFIDENCE_THRESHOLDS.HIGH) {
    // NIP pasuje, więc pomijamy blokadę - to ta sama firma/jednostka mimo różnej nazwy
    if (debug) {
      console.log(`   ✅ POMIJAM BLOKADĘ NAZWY: NIP pasuje (${nipScore.toFixed(2)} >= 0.9)`)
      console.log(`      Nazwa: ${nameScore.toFixed(2)} < 0.5, ale NIP potwierdza tożsamość`)
    }
    reasons.push('✅ NIP potwierdza tożsamość mimo różnej nazwy nadawcy')
  }

  if (debug) {
    const thresholdStatus = finalConfidence >= CONFIDENCE_THRESHOLDS.HIGH
      ? '✅ AUTO-MATCH'
      : finalConfidence >= CONFIDENCE_THRESHOLDS.MEDIUM
        ? '💡 SUGESTIA'
        : '❌ ODRZUCONE'
    console.log(`   📈 Finalna confidence: ${finalConfidence} ${thresholdStatus}`)
    console.log(`      (Progi: AUTO=${CONFIDENCE_THRESHOLDS.HIGH}, SUGESTIA=${CONFIDENCE_THRESHOLDS.MEDIUM})`)
  }

  return {
    invoiceId: invoice.id,
    paymentId: payment.id,
    confidence: finalConfidence,
    breakdown,
    reasons,
  }
}

/**
 * Find all potential matches for invoices and payments
 * Extended Payment type to include sender_subaccount and extended_title
 */
export function findMatches(
  invoices: Invoice[],
  payments: (Payment & { sender_subaccount?: string | null; extended_title?: string | null })[],
  debug: boolean = false
): {
  autoMatches: MatchResult[]
  suggestions: MatchResult[]
  unmatchedInvoices: string[]
  unmatchedPayments: string[]
  error?: string
} {
  // Resource limit validation
  const totalRecords = invoices.length + payments.length
  const totalComparisons = invoices.length * payments.length

  if (totalRecords > RESOURCE_LIMITS.MAX_TOTAL_RECORDS) {
    console.error(`[RESOURCE_LIMIT] Przekroczono limit rekordów: ${totalRecords}/${RESOURCE_LIMITS.MAX_TOTAL_RECORDS}`)
    return {
      autoMatches: [],
      suggestions: [],
      unmatchedInvoices: invoices.map(i => i.id),
      unmatchedPayments: payments.map(p => p.id),
      error: `Zbyt dużo rekordów (${totalRecords}). Maksimum: ${RESOURCE_LIMITS.MAX_TOTAL_RECORDS}. Podziel dane na mniejsze partie.`
    }
  }

  if (totalComparisons > RESOURCE_LIMITS.MAX_COMPARISONS) {
    console.error(`[RESOURCE_LIMIT] Przekroczono limit porównań: ${totalComparisons}/${RESOURCE_LIMITS.MAX_COMPARISONS}`)
    return {
      autoMatches: [],
      suggestions: [],
      unmatchedInvoices: invoices.map(i => i.id),
      unmatchedPayments: payments.map(p => p.id),
      error: `Zbyt dużo porównań (${invoices.length} × ${payments.length} = ${totalComparisons}). Zmniejsz zakres dat lub podziel dane.`
    }
  }

  const autoMatches: MatchResult[] = []
  let suggestions: MatchResult[] = []
  const matchedInvoiceIds = new Set<string>()
  const matchedPaymentIds = new Set<string>()

  // Only consider matchable invoices - exclude paid and canceled
  // Matchable = pending, overdue, partial (all need payment matching)
  // Not matchable = paid (already paid), canceled (no payment expected)
  const matchableInvoices = invoices.filter((inv) =>
    inv.payment_status !== 'paid' &&
    inv.payment_status !== 'canceled' &&
    inv.invoice_kind !== 'canceled' // Additional safeguard for canceled document type
  )

  if (debug) {
    console.log('\n' + '='.repeat(80))
    console.log('🚀 ROZPOCZYNAM ALGORYTM DOPASOWAŃ')
    console.log('='.repeat(80))
    console.log(`📋 Faktury: ${invoices.length} (do dopasowania: ${matchableInvoices.length})`)
    console.log(`💳 Płatności: ${payments.length}`)
    console.log(`📊 Liczba porównań: ${matchableInvoices.length * payments.length}`)
    console.log('-'.repeat(80))

    // Log invoices details
    console.log('\n📋 Faktury do dopasowania:')
    matchableInvoices.forEach(inv => {
      console.log(`   - ${inv.invoice_number}: ${inv.gross_amount} ${inv.currency}, nabywca: ${inv.buyer_name}, subkonto: ${inv.buyer_subaccount || 'BRAK'}`)
    })

    // Log payments details
    console.log('\n💳 Płatności:')
    payments.forEach(pay => {
      console.log(`   - ${pay.amount} ${pay.currency}: "${pay.title.substring(0, 60)}${pay.title.length > 60 ? '...' : ''}"`)
      console.log(`     nadawca: "${pay.sender_name}", subkonto: ${pay.sender_subaccount || 'BRAK'}`)
    })
    console.log('-'.repeat(80))
  }

  // === OPTYMALIZACJA: Indeksowanie płatności po walucie i buckecie kwoty ===
  const BUCKET_SIZE = 100 // PLN
  const paymentIndex = new Map<string, typeof payments>()

  for (const payment of payments) {
    const currency = payment.currency || 'PLN'
    const bucket = Math.floor(payment.amount / BUCKET_SIZE) * BUCKET_SIZE
    const key = `${currency}-${bucket}`

    if (!paymentIndex.has(key)) {
      paymentIndex.set(key, [])
    }
    paymentIndex.get(key)!.push(payment)
  }

  // Helper do pobierania kandydatów z sąsiednich bucketów
  function getCandidatePayments(invoice: Invoice): typeof payments {
    const currency = invoice.currency || 'PLN'
    const amount = invoice.gross_amount
    const tolerance = Math.max(amount * 0.1, 50) // 10% lub min 50 zł

    const minBucket = Math.floor((amount - tolerance) / BUCKET_SIZE) * BUCKET_SIZE
    const maxBucket = Math.floor((amount + tolerance) / BUCKET_SIZE) * BUCKET_SIZE

    const candidates: typeof payments = []
    for (let b = minBucket; b <= maxBucket; b += BUCKET_SIZE) {
      const key = `${currency}-${b}`
      const bucketed = paymentIndex.get(key)
      if (bucketed) candidates.push(...bucketed)
    }

    return candidates
  }

  if (debug) {
    const bucketCount = paymentIndex.size
    console.log(`\n🔧 OPTYMALIZACJA: Utworzono ${bucketCount} bucketów płatności`)
  }

  // Calculate all potential matches
  const allMatches: MatchResult[] = []
  let actualComparisons = 0

  // Track specific invoices for debug
  const debugInvoicePatterns = ['10/12', '17/12', '37/12']

  for (const invoice of matchableInvoices) {
    const isTrackedInvoice = debugInvoicePatterns.some(p => invoice.invoice_number.includes(p))

    // Pobierz tylko płatności z odpowiednich bucketów (ta sama waluta + podobna kwota)
    const candidatePayments = getCandidatePayments(invoice)

    if (isTrackedInvoice) {
      console.log(`\n🔍 [TRACKING] Faktura ${invoice.invoice_number} (${invoice.gross_amount} PLN)`)
      console.log(`   Kandydatów płatności: ${candidatePayments.length}`)
    }

    for (const payment of candidatePayments) {
      actualComparisons++

      if (isTrackedInvoice) {
        console.log(`   → Porównuję z płatnością: ${payment.amount} PLN, tytuł: "${payment.title.substring(0, 60)}..."`)
      }

      const result = calculateMatchConfidence(invoice, payment, debug || isTrackedInvoice)

      if (isTrackedInvoice) {
        console.log(`     Confidence: ${result.confidence.toFixed(3)}, threshold: ${CONFIDENCE_THRESHOLDS.MEDIUM}`)
      }

      // Only consider matches with some confidence
      if (result.confidence >= CONFIDENCE_THRESHOLDS.MEDIUM) {
        allMatches.push(result)
        if (debug || isTrackedInvoice) {
          console.log(`   ✓ Dodano do listy potencjalnych dopasowań`)
        }
      } else if (debug || isTrackedInvoice) {
        console.log(`   ✗ Pominięto (confidence ${result.confidence.toFixed(3)} < ${CONFIDENCE_THRESHOLDS.MEDIUM})`)
      }
    }

    if (isTrackedInvoice && candidatePayments.length === 0) {
      console.log(`   ⚠️ BRAK kandydatów płatności w bucket! Sprawdź kwotę i walutę.`)
    }
  }

  if (debug) {
    const theoreticalComparisons = matchableInvoices.length * payments.length
    const reduction = theoreticalComparisons > 0
      ? Math.round((1 - actualComparisons / theoreticalComparisons) * 100)
      : 0
    console.log('\n' + '-'.repeat(80))
    console.log(`📊 PODSUMOWANIE PORÓWNAŃ:`)
    console.log(`   - Teoretyczne porównania (bez optymalizacji): ${theoreticalComparisons}`)
    console.log(`   - Faktyczne porównania (z bucketami): ${actualComparisons}`)
    console.log(`   - Redukcja: ${reduction}%`)
    console.log(`   - Potencjalne dopasowania: ${allMatches.length}`)
  }

  // Sort by confidence (highest first)
  allMatches.sort((a, b) => b.confidence - a.confidence)

  // Process matches - each invoice and payment can only be matched once
  for (const match of allMatches) {
    if (matchedInvoiceIds.has(match.invoiceId) || matchedPaymentIds.has(match.paymentId)) {
      continue
    }

    if (match.confidence >= CONFIDENCE_THRESHOLDS.HIGH) {
      autoMatches.push(match)
      matchedInvoiceIds.add(match.invoiceId)
      matchedPaymentIds.add(match.paymentId)
    } else if (match.confidence >= CONFIDENCE_THRESHOLDS.MEDIUM) {
      suggestions.push(match)
      // Don't mark as matched yet - these are just suggestions
    }
  }

  // Apply resource limit on suggestions
  if (suggestions.length > RESOURCE_LIMITS.MAX_SUGGESTIONS) {
    console.warn(`[RESOURCE_LIMIT] Obcięto sugestie: ${suggestions.length} → ${RESOURCE_LIMITS.MAX_SUGGESTIONS}`)
    suggestions = suggestions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, RESOURCE_LIMITS.MAX_SUGGESTIONS)
  }

  // Find unmatched invoices and payments
  const unmatchedInvoices = matchableInvoices
    .filter((inv) => !matchedInvoiceIds.has(inv.id))
    .map((inv) => inv.id)

  const unmatchedPayments = payments
    .filter((pay) => !matchedPaymentIds.has(pay.id))
    .map((pay) => pay.id)

  if (debug) {
    console.log('\n' + '='.repeat(80))
    console.log('🏁 WYNIKI ALGORYTMU DOPASOWAŃ')
    console.log('='.repeat(80))
    console.log(`✅ Auto-dopasowania: ${autoMatches.length}`)
    autoMatches.forEach(m => console.log(`   - Faktura ${m.invoiceId.substring(0,8)}... ↔ Płatność ${m.paymentId.substring(0,8)}... (${m.confidence})`))
    console.log(`💡 Sugestie: ${suggestions.length}`)
    suggestions.forEach(m => console.log(`   - Faktura ${m.invoiceId.substring(0,8)}... ↔ Płatność ${m.paymentId.substring(0,8)}... (${m.confidence})`))
    console.log(`❌ Niedopasowane faktury: ${unmatchedInvoices.length}`)
    console.log(`❌ Niedopasowane płatności: ${unmatchedPayments.length}`)
    console.log('='.repeat(80) + '\n')
  }

  return {
    autoMatches,
    suggestions,
    unmatchedInvoices,
    unmatchedPayments,
  }
}

/**
 * Get match quality label based on confidence
 */
export function getMatchQuality(confidence: number): {
  label: string
  color: string
} {
  if (confidence >= CONFIDENCE_THRESHOLDS.HIGH) {
    return { label: 'Wysoka zgodność', color: 'text-green-600' }
  }
  if (confidence >= 0.75) {
    return { label: 'Dobra zgodność', color: 'text-blue-600' }
  }
  if (confidence >= CONFIDENCE_THRESHOLDS.MEDIUM) {
    return { label: 'Średnia zgodność', color: 'text-yellow-600' }
  }
  return { label: 'Niska zgodność', color: 'text-red-600' }
}

// ============================================================================
// FUNKCJE GRUPOWANIA FAKTUR
// ============================================================================

/**
 * Extract month key from date string (YYYY-MM format)
 */
function getMonthKey(dateStr: string): string {
  const date = new Date(dateStr)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

/**
 * Create buyer key for grouping invoices
 * Uses NIP if available, otherwise normalized name
 */
function createBuyerKey(invoice: Invoice): string {
  if (invoice.buyer_nip) {
    const normalizedNip = normalizeNIP(invoice.buyer_nip)
    if (normalizedNip) {
      return `nip:${normalizedNip}`
    }
  }
  // Fallback to normalized name
  return `name:${normalizeString(invoice.buyer_name)}`
}

/**
 * Group invoices by buyer (NIP or name) and month
 * Returns map: "buyerKey|YYYY-MM" -> Invoice[]
 */
export function groupInvoicesByBuyerAndMonth(invoices: Invoice[]): Map<string, Invoice[]> {
  const groups = new Map<string, Invoice[]>()

  for (const invoice of invoices) {
    const buyerKey = createBuyerKey(invoice)
    const monthKey = getMonthKey(invoice.issue_date)
    const groupKey = `${buyerKey}|${monthKey}`

    if (!groups.has(groupKey)) {
      groups.set(groupKey, [])
    }
    groups.get(groupKey)!.push(invoice)
  }

  return groups
}

/**
 * Check if payment sender matches invoice buyer
 * Compares NIP and/or company name
 * More flexible matching for group suggestions
 */
function buyerMatchesPaymentSender(
  invoice: Invoice,
  payment: Payment & { sender_subaccount?: string | null; extended_title?: string | null },
  debug: boolean = false
): { matches: boolean; score: number; reason: string } {
  // 1. Check subaccount match first (highest priority)
  if (invoice.buyer_subaccount && payment.sender_subaccount) {
    const invoiceLast12 = extractLast12Digits(invoice.buyer_subaccount)
    const paymentLast12 = extractLast12Digits(payment.sender_subaccount)
    if (invoiceLast12 && paymentLast12 && invoiceLast12 === paymentLast12) {
      return { matches: true, score: 1.0, reason: 'Zgodne subkonto bankowe' }
    }
  }

  // 2. Check NIP match - in title, extended title, sender name, or ID IPH
  if (invoice.buyer_nip) {
    const normalizedBuyerNip = normalizeNIP(invoice.buyer_nip)
    if (normalizedBuyerNip) {
      // PRIORITY: Check NIP from ID IPH in extended_title (most reliable for mBank Corporate)
      // Format: "ID IPH: XX005832141328" -> NIP is last 10 digits: "5832141328"
      if (payment.extended_title) {
        const idIphNip = extractNIPFromIdIPH(payment.extended_title)
        if (idIphNip === normalizedBuyerNip) {
          if (debug) {
            console.log(`      ✓ Znaleziono NIP nabywcy w ID IPH: ${idIphNip}`)
          }
          return { matches: true, score: 0.98, reason: 'Zgodny NIP z ID IPH' }
        }
      }
      // Check in payment title
      const titleNip = extractNIP(payment.title)
      if (titleNip === normalizedBuyerNip) {
        return { matches: true, score: 0.95, reason: 'Zgodny NIP w tytule przelewu' }
      }
      // Check in extended title (fallback for other NIP formats)
      if (payment.extended_title) {
        const extNip = extractNIP(payment.extended_title)
        if (extNip === normalizedBuyerNip) {
          return { matches: true, score: 0.95, reason: 'Zgodny NIP w opisie rozszerzonym' }
        }
      }
      // Check in sender name (some payments have NIP in sender name)
      const senderNip = extractNIP(payment.sender_name)
      if (senderNip === normalizedBuyerNip) {
        return { matches: true, score: 0.95, reason: 'Zgodny NIP w nazwie nadawcy' }
      }
    }
  }

  // 3. Check company name similarity
  const nameScore = compareCompanyNames(invoice.buyer_name, payment.sender_name)

  if (debug) {
    console.log(`      Porównanie nazw: "${invoice.buyer_name}" vs "${payment.sender_name}" = ${nameScore.toFixed(2)}`)
  }

  if (nameScore >= 0.8) {
    return { matches: true, score: nameScore, reason: 'Zgodna nazwa firmy' }
  }
  if (nameScore >= 0.6) {
    return { matches: true, score: nameScore, reason: 'Podobna nazwa firmy' }
  }

  // 4. Check if buyer name words appear in sender name (more flexible)
  // This handles cases like "Jan Kowalski" vs "KOWALSKI JAN USŁUGI BUDOWLANE"
  const buyerWords = normalizeString(invoice.buyer_name).split(' ').filter(w => w.length > 2)
  const senderNormalized = normalizeString(payment.sender_name)

  let matchedWords = 0
  for (const word of buyerWords) {
    if (senderNormalized.includes(word)) {
      matchedWords++
    }
  }

  if (buyerWords.length > 0 && matchedWords >= Math.min(2, buyerWords.length)) {
    const wordScore = 0.5 + (matchedWords / buyerWords.length) * 0.3
    if (debug) {
      console.log(`      Dopasowanie słów: ${matchedWords}/${buyerWords.length} = ${wordScore.toFixed(2)}`)
    }
    return { matches: true, score: wordScore, reason: `Dopasowano ${matchedWords} słów z nazwy` }
  }

  return { matches: false, score: nameScore, reason: '' }
}

/**
 * Find payment that matches the sum of grouped invoices
 * Tolerance: 0.1% difference allowed
 */
export function findPaymentForInvoiceSum(
  invoices: Invoice[],
  payments: (Payment & { sender_subaccount?: string | null; extended_title?: string | null })[],
  usedPaymentIds: Set<string>,
  debug: boolean = false
): { payment: Payment; confidence: number; reasons: string[] } | null {
  if (invoices.length === 0) return null

  // Calculate total amount
  const totalAmount = invoices.reduce((sum, inv) => sum + inv.gross_amount, 0)
  const tolerance = totalAmount * 0.001 // 0.1% tolerance

  // Get buyer info from first invoice (all should have same buyer)
  const buyerNip = invoices[0].buyer_nip
  const buyerName = invoices[0].buyer_name

  if (debug) {
    console.log(`\n🔍 Szukam płatności dla sumy ${invoices.length} faktur:`)
    console.log(`   Suma: ${totalAmount.toFixed(2)} PLN (tolerancja: ±${tolerance.toFixed(2)})`)
    console.log(`   Nabywca: ${buyerName} (NIP: ${buyerNip || 'brak'})`)
  }

  for (const payment of payments) {
    // Skip already used payments
    if (usedPaymentIds.has(payment.id)) continue

    // Skip if currency doesn't match
    if (payment.currency !== invoices[0].currency) continue

    // Check if amount matches within tolerance
    const amountDiff = Math.abs(payment.amount - totalAmount)
    if (amountDiff > tolerance) continue

    // Check if sender matches buyer
    const match = buyerMatchesPaymentSender(invoices[0], payment, debug)
    if (!match.matches) {
      if (debug && amountDiff <= tolerance) {
        console.log(`   ⏭️ Pominięto płatność ${payment.amount.toFixed(2)} PLN - nabywca nie pasuje`)
        console.log(`      Nadawca: ${payment.sender_name}`)
      }
      continue
    }

    // Calculate confidence based on match quality
    let confidence = 0.8 // Base confidence for sum match

    // Bonus for exact amount
    if (amountDiff < 0.01) {
      confidence += 0.1
    }

    // Bonus for high buyer match score
    confidence += match.score * 0.1

    // Check if any invoice numbers are in payment title
    // Normalize to handle bank-inserted spaces (e.g., "PS 1 7/12/2025" → "PS 17/12/2025")
    const paymentText = normalizePaymentTitle(
      payment.extended_title
        ? `${payment.title} ${payment.extended_title}`
        : payment.title
    )

    let invoiceNumbersFound = 0
    for (const inv of invoices) {
      const invScore = matchInvoiceNumberFlexible(inv.invoice_number, paymentText)
      if (invScore >= 0.8) {
        invoiceNumbersFound++
      }
    }

    if (invoiceNumbersFound > 0) {
      confidence += 0.05 * Math.min(invoiceNumbersFound, 3)
    }

    const reasons = [
      `Suma ${invoices.length} faktur: ${totalAmount.toFixed(2)} PLN`,
      match.reason,
      `Kwota płatności: ${payment.amount.toFixed(2)} PLN`,
    ]

    if (invoiceNumbersFound > 0) {
      reasons.push(`Znaleziono ${invoiceNumbersFound} numer(y) faktur w tytule`)
    }

    if (debug) {
      console.log(`   ✅ Znaleziono płatność: ${payment.amount.toFixed(2)} PLN`)
      console.log(`      Confidence: ${confidence.toFixed(2)}`)
      console.log(`      Powody: ${reasons.join(', ')}`)
    }

    return {
      payment,
      confidence: Math.min(confidence, 0.95), // Cap at 0.95 for group matches
      reasons,
    }
  }

  if (debug) {
    console.log(`   ❌ Nie znaleziono pasującej płatności`)
    // Show payments with matching amount (for debugging)
    const matchingAmountPayments = payments.filter(p => {
      if (usedPaymentIds.has(p.id)) return false
      if (p.currency !== invoices[0].currency) return false
      return Math.abs(p.amount - totalAmount) <= tolerance
    })
    if (matchingAmountPayments.length > 0) {
      console.log(`   ⚠️ Znaleziono ${matchingAmountPayments.length} płatności z pasującą kwotą, ale nabywca nie pasuje:`)
      matchingAmountPayments.slice(0, 3).forEach(p => {
        console.log(`      - ${p.amount.toFixed(2)} PLN od "${p.sender_name}"`)
      })
    }
  }

  return null
}

/**
 * Find payment suggestions for invoices from the same buyer
 * (when no exact match, but buyer has payments)
 */
export function findBuyerPaymentSuggestions(
  invoice: Invoice,
  payments: (Payment & { sender_subaccount?: string | null; extended_title?: string | null })[],
  usedPaymentIds: Set<string>,
  existingMatchPaymentIds: Set<string>,
  debug: boolean = false
): MatchSuggestion[] {
  const suggestions: MatchSuggestion[] = []

  if (debug) {
    console.log(`\n🔍 Szukam sugestii "ten sam nabywca" dla faktury ${invoice.invoice_number}`)
  }

  for (const payment of payments) {
    // Skip already matched/used payments
    if (usedPaymentIds.has(payment.id) || existingMatchPaymentIds.has(payment.id)) continue

    // Skip if currency doesn't match
    if (payment.currency !== invoice.currency) continue

    // Check if sender matches buyer
    const match = buyerMatchesPaymentSender(invoice, payment)
    if (!match.matches || match.score < 0.6) continue

    // Check if payment title doesn't explicitly reference a different invoice
    // Normalize to handle bank-inserted spaces (e.g., "PS 1 7/12/2025" → "PS 17/12/2025")
    const paymentText = normalizePaymentTitle(
      payment.extended_title
        ? `${payment.title} ${payment.extended_title}`
        : payment.title
    )

    const extractedInvoices = extractMultipleInvoiceNumbers(paymentText)

    // If invoice numbers found in title and none match our invoice, skip
    if (extractedInvoices.length > 0) {
      const ourInvoiceMatches = extractedInvoices.some(
        (ext) => matchInvoiceNumberFlexible(invoice.invoice_number, ext) >= 0.8
      )
      if (!ourInvoiceMatches) {
        if (debug) {
          console.log(`   ⏭️ Pominięto płatność ${payment.id.substring(0,8)} - tytuł wskazuje na inne faktury`)
        }
        continue
      }
    }

    // Calculate base confidence (lower than regular matches)
    let confidence = 0.4 + match.score * 0.2 // 0.52-0.6 range

    // Bonus for closer amount
    const amountRatio = Math.min(payment.amount, invoice.gross_amount) /
                        Math.max(payment.amount, invoice.gross_amount)
    if (amountRatio >= 0.9) {
      confidence += 0.15
    } else if (amountRatio >= 0.7) {
      confidence += 0.1
    }

    // Bonus for date proximity
    const dateScore = calculateDateScore(invoice.due_date, payment.transaction_date)
    confidence += dateScore * 0.05

    const reasons = [
      `Ten sam nabywca: ${match.reason}`,
      `Kwota faktury: ${invoice.gross_amount.toFixed(2)} PLN`,
      `Kwota płatności: ${payment.amount.toFixed(2)} PLN`,
    ]

    if (Math.abs(payment.amount - invoice.gross_amount) > 0.01) {
      const diff = payment.amount - invoice.gross_amount
      reasons.push(`Różnica: ${diff > 0 ? '+' : ''}${diff.toFixed(2)} PLN`)
    }

    const breakdown: MatchBreakdown = {
      subaccount: invoice.buyer_subaccount && payment.sender_subaccount ?
        calculateSubaccountScore(invoice.buyer_subaccount, payment.sender_subaccount) : 0,
      amount: calculateAmountScore(invoice.gross_amount, payment.amount),
      invoiceNumber: calculateInvoiceNumberScore(invoice.invoice_number, payment.title, payment.extended_title),
      name: match.score,
      nip: invoice.buyer_nip ? calculateNIPScore(invoice.buyer_nip, payment.title, payment.extended_title) : 0,
      date: dateScore,
    }

    suggestions.push({
      invoice,
      payment,
      confidence: Math.min(confidence, 0.7), // Cap at 0.7 for buyer-only suggestions
      breakdown,
      reasons,
    })

    if (debug) {
      console.log(`   💡 Dodano sugestię: płatność ${payment.amount.toFixed(2)} PLN (conf: ${confidence.toFixed(2)})`)
    }
  }

  // Sort by confidence
  suggestions.sort((a, b) => b.confidence - a.confidence)

  // Return top 3 suggestions per invoice
  return suggestions.slice(0, 3)
}

/**
 * Extended matching function that includes group matching
 *
 * Steps:
 * 1. Standard matching (existing findMatches)
 * 2. Group invoices by buyer+month, find payments for sums
 * 3. Multi-month grouping (2 consecutive months)
 * 4. Same-buyer suggestions for remaining unmatched
 */
export function findMatchesExtended(
  invoices: Invoice[],
  payments: (Payment & { sender_subaccount?: string | null; extended_title?: string | null })[],
  options: {
    enableGroupMatching?: boolean
    maxMonthsToGroup?: number
    debug?: boolean
  } = {}
): {
  autoMatches: MatchResult[]
  suggestions: (MatchResult | MatchSuggestion)[]
  groupSuggestions: GroupMatchSuggestion[]
  unmatchedInvoices: string[]
  unmatchedPayments: string[]
  error?: string
} {
  const {
    enableGroupMatching = true,
    maxMonthsToGroup = 2,
    debug = false,
  } = options

  // 1. Run standard matching first
  const standardResults = findMatches(invoices, payments, debug)

  // Propagate error from findMatches
  if (standardResults.error) {
    return {
      autoMatches: [],
      suggestions: [],
      groupSuggestions: [],
      unmatchedInvoices: standardResults.unmatchedInvoices,
      unmatchedPayments: standardResults.unmatchedPayments,
      error: standardResults.error,
    }
  }

  if (!enableGroupMatching) {
    return {
      autoMatches: standardResults.autoMatches,
      suggestions: standardResults.suggestions as (MatchResult | MatchSuggestion)[],
      groupSuggestions: [],
      unmatchedInvoices: standardResults.unmatchedInvoices,
      unmatchedPayments: standardResults.unmatchedPayments,
    }
  }

  const groupSuggestions: GroupMatchSuggestion[] = []

  // Track used payments
  const usedPaymentIds = new Set<string>()
  for (const match of standardResults.autoMatches) {
    usedPaymentIds.add(match.paymentId)
  }

  // Get invoices that weren't auto-matched
  const unmatchedInvoiceIds = new Set(standardResults.unmatchedInvoices)
  const unmatchedInvoices = invoices.filter(inv => unmatchedInvoiceIds.has(inv.id))

  if (debug) {
    console.log('\n' + '='.repeat(80))
    console.log('🔄 ROZSZERZONE DOPASOWYWANIE - GRUPOWANIE')
    console.log('='.repeat(80))
    console.log(`Niedopasowane faktury: ${unmatchedInvoices.length}`)
  }

  // 2. Group unmatched invoices by buyer and month
  const groups = groupInvoicesByBuyerAndMonth(unmatchedInvoices)

  if (debug) {
    console.log(`Grup (nabywca+miesiąc): ${groups.size}`)
    groups.forEach((invs, key) => {
      const total = invs.reduce((s, i) => s + i.gross_amount, 0)
      console.log(`   ${key}: ${invs.length} faktur, suma: ${total.toFixed(2)} PLN`)
    })
  }

  // Process groups with more than 1 invoice
  const processedInvoiceIds = new Set<string>()

  for (const [groupKey, groupInvoices] of groups) {
    if (groupInvoices.length < 2) continue

    if (debug) {
      const total = groupInvoices.reduce((s, i) => s + i.gross_amount, 0)
      console.log(`\n📦 Przetwarzam grupę: ${groupKey}`)
      console.log(`   Faktury (${groupInvoices.length}):`)
      groupInvoices.forEach(inv => {
        console.log(`     - ${inv.invoice_number}: ${inv.gross_amount.toFixed(2)} PLN`)
      })
      console.log(`   SUMA: ${total.toFixed(2)} PLN`)
    }

    // Try to find payment for sum of this month's invoices
    const result = findPaymentForInvoiceSum(groupInvoices, payments, usedPaymentIds, debug)

    if (result) {
      const [, monthKey] = groupKey.split('|')
      const buyerName = groupInvoices[0].buyer_name
      const buyerNip = groupInvoices[0].buyer_nip

      groupSuggestions.push({
        type: 'group',
        invoices: groupInvoices,
        payment: result.payment,
        confidence: result.confidence,
        totalInvoiceAmount: groupInvoices.reduce((s, i) => s + i.gross_amount, 0),
        reasons: result.reasons,
        buyerName,
        buyerNip: buyerNip || undefined,
        groupPeriod: {
          from: monthKey,
          to: monthKey,
        },
      })

      // Mark payment and invoices as used
      usedPaymentIds.add(result.payment.id)
      groupInvoices.forEach(inv => processedInvoiceIds.add(inv.id))
    }
  }

  // 3. Try multi-month grouping for remaining unprocessed invoices
  if (maxMonthsToGroup >= 2) {
    // Group remaining invoices by buyer only
    const buyerGroups = new Map<string, Invoice[]>()

    for (const invoice of unmatchedInvoices) {
      if (processedInvoiceIds.has(invoice.id)) continue

      const buyerKey = createBuyerKey(invoice)
      if (!buyerGroups.has(buyerKey)) {
        buyerGroups.set(buyerKey, [])
      }
      buyerGroups.get(buyerKey)!.push(invoice)
    }

    for (const [, buyerInvoices] of buyerGroups) {
      if (buyerInvoices.length < 2) continue

      // Sort by issue date
      buyerInvoices.sort((a, b) =>
        new Date(a.issue_date).getTime() - new Date(b.issue_date).getTime()
      )

      // Group by consecutive months (up to maxMonthsToGroup)
      const monthGroups: Invoice[][] = []
      let currentGroup: Invoice[] = []
      let lastMonth = ''

      for (const inv of buyerInvoices) {
        const month = getMonthKey(inv.issue_date)

        if (currentGroup.length === 0) {
          currentGroup.push(inv)
          lastMonth = month
        } else if (month === lastMonth) {
          currentGroup.push(inv)
        } else {
          // Check if consecutive month
          const lastDate = new Date(lastMonth + '-01')
          const currentDate = new Date(month + '-01')
          const monthsDiff = (currentDate.getFullYear() - lastDate.getFullYear()) * 12 +
                            (currentDate.getMonth() - lastDate.getMonth())

          if (monthsDiff === 1 && currentGroup.length < maxMonthsToGroup * 10) {
            currentGroup.push(inv)
            lastMonth = month
          } else {
            if (currentGroup.length >= 2) {
              monthGroups.push([...currentGroup])
            }
            currentGroup = [inv]
            lastMonth = month
          }
        }
      }

      if (currentGroup.length >= 2) {
        monthGroups.push(currentGroup)
      }

      // Try to find payments for multi-month groups
      for (const multiMonthInvoices of monthGroups) {
        // Skip if all already processed
        if (multiMonthInvoices.every(inv => processedInvoiceIds.has(inv.id))) continue

        const result = findPaymentForInvoiceSum(multiMonthInvoices, payments, usedPaymentIds, debug)

        if (result) {
          const months = [...new Set(multiMonthInvoices.map(inv => getMonthKey(inv.issue_date)))].sort()

          groupSuggestions.push({
            type: 'group',
            invoices: multiMonthInvoices,
            payment: result.payment,
            confidence: result.confidence * 0.95, // Slightly lower for multi-month
            totalInvoiceAmount: multiMonthInvoices.reduce((s, i) => s + i.gross_amount, 0),
            reasons: [...result.reasons, `Faktury z ${months.length} miesięcy`],
            buyerName: multiMonthInvoices[0].buyer_name,
            buyerNip: multiMonthInvoices[0].buyer_nip || undefined,
            groupPeriod: {
              from: months[0],
              to: months[months.length - 1],
            },
          })

          usedPaymentIds.add(result.payment.id)
          multiMonthInvoices.forEach(inv => processedInvoiceIds.add(inv.id))
        }
      }
    }
  }

  // 4. "Same buyer" suggestions are DISABLED - they generate too many false positives
  // When enabled, this generates 68k+ suggestions which is not useful
  // TODO: If needed, re-enable with stricter criteria (e.g., amount within 20%)

  // Combine all suggestions (only from standard matching, not buyer suggestions)
  let allSuggestions = [...standardResults.suggestions]

  // Sort by confidence
  allSuggestions.sort((a, b) => b.confidence - a.confidence)
  groupSuggestions.sort((a, b) => b.confidence - a.confidence)

  // Apply resource limits
  if (allSuggestions.length > RESOURCE_LIMITS.MAX_SUGGESTIONS) {
    console.warn(`[RESOURCE_LIMIT] Obcięto sugestie: ${allSuggestions.length} → ${RESOURCE_LIMITS.MAX_SUGGESTIONS}`)
    allSuggestions = allSuggestions.slice(0, RESOURCE_LIMITS.MAX_SUGGESTIONS)
  }

  if (groupSuggestions.length > RESOURCE_LIMITS.MAX_GROUP_SUGGESTIONS) {
    console.warn(`[RESOURCE_LIMIT] Obcięto sugestie grupowe: ${groupSuggestions.length} → ${RESOURCE_LIMITS.MAX_GROUP_SUGGESTIONS}`)
    groupSuggestions.splice(RESOURCE_LIMITS.MAX_GROUP_SUGGESTIONS)
  }

  // Recalculate unmatched lists
  // Note: Group suggestions are not auto-matched, they're suggestions that require user confirmation
  const finalMatchedInvoiceIds = new Set<string>()
  for (const match of standardResults.autoMatches) {
    finalMatchedInvoiceIds.add(match.invoiceId)
  }

  const finalUnmatchedInvoices = invoices
    .filter(inv => !finalMatchedInvoiceIds.has(inv.id))
    .map(inv => inv.id)

  const finalUnmatchedPayments = payments
    .filter(pay => !usedPaymentIds.has(pay.id))
    .map(pay => pay.id)

  if (debug) {
    console.log('\n' + '='.repeat(80))
    console.log('🏁 WYNIKI ROZSZERZONEGO DOPASOWYWANIA')
    console.log('='.repeat(80))
    console.log(`✅ Auto-dopasowania: ${standardResults.autoMatches.length}`)
    console.log(`🔗 Sugestie grupowe: ${groupSuggestions.length}`)
    groupSuggestions.forEach(g => {
      console.log(`   - ${g.invoices.length} faktur za ${g.totalInvoiceAmount.toFixed(2)} PLN → płatność ${g.payment.amount.toFixed(2)} PLN (conf: ${g.confidence.toFixed(2)})`)
    })
    console.log(`💡 Sugestie pojedyncze: ${allSuggestions.length}`)
    console.log(`❌ Niedopasowane faktury: ${finalUnmatchedInvoices.length}`)
    console.log(`❌ Niedopasowane płatności: ${finalUnmatchedPayments.length}`)
    console.log('='.repeat(80) + '\n')
  }

  return {
    autoMatches: standardResults.autoMatches,
    suggestions: allSuggestions,
    groupSuggestions,
    unmatchedInvoices: finalUnmatchedInvoices,
    unmatchedPayments: finalUnmatchedPayments,
  }
}
