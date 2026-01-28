import type { ParsedPayment, ParseResult, ImportError } from '@/types'
import type { ImportSource } from '@/lib/constants'

// ============================================
// Payment Exclusion Rules
// ============================================

/**
 * Payments to these accounts are excluded from import.
 * These are typically technical accounts (e.g., VAT split payment accounts).
 * Account numbers should be stored without spaces.
 */
const EXCLUDED_RECEIVER_ACCOUNTS = [
  '43114020620000763593001003', // Rachunek techniczny VAT
]

/**
 * Payments with titles containing these phrases are excluded.
 * Case-insensitive matching is used.
 * This filters out internal VAT transfers that should not be matched with invoices.
 */
const EXCLUDED_TITLE_PATTERNS = [
  'przeksięgowanie vat',
  'przeksiegowanie vat', // bez polskich znaków
]

// Parse Polish amount format (1 234,56)
function parsePolishAmount(value: string): number | null {
  if (!value) return null

  const cleaned = value
    .replace(/\s/g, '')
    .replace(/[^\d,.-]/g, '')
    .trim()

  if (!cleaned) return null

  // Replace comma with dot for parsing
  const normalized = cleaned.replace(',', '.')
  const amount = parseFloat(normalized)

  return isNaN(amount) ? null : Math.round(amount * 100) / 100
}

// Parse date from various formats
function parseDate(value: string): string | null {
  if (!value) return null

  const cleaned = value.trim()

  // YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned
  }

  // DD.MM.YYYY or DD/MM/YYYY format
  const europeanMatch = cleaned.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/)
  if (europeanMatch) {
    const [, day, month, year] = europeanMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  // YYMMDD format (MT940)
  if (/^\d{6}$/.test(cleaned)) {
    const year = parseInt(cleaned.substring(0, 2), 10)
    const month = cleaned.substring(2, 4)
    const day = cleaned.substring(4, 6)
    const fullYear = year > 50 ? 1900 + year : 2000 + year
    return `${fullYear}-${month}-${day}`
  }

  return null
}

// Generate a unique reference for a transaction
function generateReference(date: string, amount: number, sender: string): string {
  const hash = [date, amount.toString(), sender].join('|')
  let hashCode = 0
  for (let i = 0; i < hash.length; i++) {
    hashCode = (hashCode << 5) - hashCode + hash.charCodeAt(i)
    hashCode = hashCode & hashCode
  }
  return `REF${Math.abs(hashCode).toString(16).toUpperCase()}`
}

// Parse CSV line with semicolon or comma delimiter
function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  result.push(current.trim())
  return result
}

// ============================================
// MT940 Parser
// ============================================
export function parseMT940(content: string): ParseResult<ParsedPayment> {
  const errors: ImportError[] = []
  const warnings: string[] = []
  const data: ParsedPayment[] = []

  // Normalize line endings
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

  let currentTransaction: Partial<ParsedPayment> | null = null
  let detailsLines: string[] = []
  let lineNumber = 0
  let excludedVatCount = 0

  // Helper to save transaction with VAT filtering
  const saveTransaction = () => {
    if (!currentTransaction || !currentTransaction.transaction_date || !currentTransaction.amount) {
      return
    }
    const sender = detailsLines.find((l) => l && !l.startsWith(':'))?.trim() || 'Nieznany'
    const titleLines = detailsLines.filter((l) => l && !l.startsWith(':') && l !== sender)
    const title = titleLines.join(' ').trim() || 'Brak tytułu'

    // Check for VAT transfer patterns
    const titleLower = title.toLowerCase()
    const isVatTransfer = EXCLUDED_TITLE_PATTERNS.some(pattern => titleLower.includes(pattern))
    if (isVatTransfer) {
      excludedVatCount++
      return
    }

    data.push({
      transaction_date: currentTransaction.transaction_date,
      amount: currentTransaction.amount,
      currency: 'PLN',
      sender_name: sender,
      sender_account: null,
      title,
      reference: currentTransaction.reference || generateReference(
        currentTransaction.transaction_date,
        currentTransaction.amount,
        sender
      ),
    })
  }

  for (const line of lines) {
    lineNumber++
    const trimmedLine = line.trim()

    // Transaction line :61:
    if (trimmedLine.startsWith(':61:')) {
      // Save previous transaction if exists
      saveTransaction()

      // Parse :61: line
      // Format: YYMMDDYYMMDC/DAmount...NTRFReference
      const transactionData = trimmedLine.substring(4)

      // Extract date (first 6 digits after :61:)
      const dateStr = transactionData.substring(0, 6)
      const transactionDate = parseDate(dateStr)

      if (!transactionDate) {
        errors.push({
          row: lineNumber,
          field: 'transaction_date',
          message: 'Nieprawidłowy format daty',
          value: dateStr,
        })
        currentTransaction = null
        detailsLines = []
        continue
      }

      // Find C (credit) or D (debit) and amount
      // Skip booking date (next 4 characters could be MMDD)
      const remaining = transactionData.substring(6)

      // Look for C (credit) followed by amount
      const creditMatch = remaining.match(/C(\d+)/)
      if (!creditMatch) {
        // Skip debits (we only care about incoming payments)
        currentTransaction = null
        detailsLines = []
        continue
      }

      // Parse amount (MT940 amount has no decimal point, last 2 digits are cents)
      const rawAmount = creditMatch[1]
      const amount = parseInt(rawAmount, 10) / 100

      // Extract reference if present
      let reference: string | null = null
      const refMatch = transactionData.match(/\/\/([A-Z0-9]+)/)
      if (refMatch) {
        reference = refMatch[1]
      }

      currentTransaction = {
        transaction_date: transactionDate,
        amount,
        reference,
      }
      detailsLines = []
    }
    // Details line :86:
    else if (trimmedLine.startsWith(':86:')) {
      detailsLines.push(trimmedLine.substring(4))
    }
    // Continuation of details
    else if (currentTransaction && !trimmedLine.startsWith(':') && trimmedLine) {
      detailsLines.push(trimmedLine)
    }
  }

  // Save last transaction
  saveTransaction()

  if (data.length === 0 && errors.length === 0) {
    warnings.push('Nie znaleziono transakcji przychodzących (kredytowych) w pliku')
  }

  if (excludedVatCount > 0) {
    warnings.push(`Pominięto ${excludedVatCount} płatności na rachunek techniczny VAT`)
  }

  return {
    success: errors.length === 0,
    data,
    errors,
    warnings,
  }
}

// ============================================
// mBank CSV Parser (standard format)
// ============================================
export function parseMBankCSV(content: string): ParseResult<ParsedPayment> {
  const errors: ImportError[] = []
  const warnings: string[] = []
  const data: ParsedPayment[] = []

  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim())

  if (lines.length < 2) {
    return {
      success: false,
      data: [],
      errors: [{ row: 0, field: 'file', message: 'Plik jest pusty lub zawiera tylko nagłówki' }],
      warnings: [],
    }
  }

  let excludedVatCount = 0

  // Skip header line (starts with #)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const rowNumber = i + 1
    const values = parseCSVLine(line, ';')

    // mBank format:
    // #Data operacji;#Data księgowania;#Opis operacji;#Tytuł;#Nadawca/Odbiorca;#Numer konta;#Kwota;#Saldo po operacji
    // Index:    0            1                2            3           4              5          6          7

    const transactionDate = parseDate(values[0])
    if (!transactionDate) {
      errors.push({
        row: rowNumber,
        field: 'transaction_date',
        message: 'Nieprawidłowy format daty',
        value: values[0],
      })
      continue
    }

    const amount = parsePolishAmount(values[6])
    if (amount === null || amount <= 0) {
      // Skip outgoing payments (negative amounts)
      continue
    }

    // Check title for VAT transfer patterns
    const titleForCheck = values[3]?.toLowerCase() || ''
    const descForCheck = values[2]?.toLowerCase() || ''
    const isVatTransfer = EXCLUDED_TITLE_PATTERNS.some(
      pattern => titleForCheck.includes(pattern) || descForCheck.includes(pattern)
    )
    if (isVatTransfer) {
      excludedVatCount++
      continue
    }

    const senderName = values[4]?.trim() || 'Nieznany'
    const senderAccount = values[5]?.trim() || null
    const title = values[3]?.trim() || 'Brak tytułu'

    data.push({
      transaction_date: transactionDate,
      amount,
      currency: 'PLN',
      sender_name: senderName,
      sender_account: senderAccount,
      title,
      reference: generateReference(transactionDate, amount, senderName),
    })
  }

  if (excludedVatCount > 0) {
    warnings.push(`Pominięto ${excludedVatCount} płatności na rachunek techniczny VAT`)
  }

  return {
    success: errors.length === 0,
    data,
    errors,
    warnings,
  }
}

// ============================================
// Helper: Parse full transaction description (Pełny opis transakcji)
// Format: "911 Transakcja Collect; ID IPH: XX009512412845; z rach.: 58194010763200246900000000; od: XRAY GROUP SP. Z O. O. ...; tyt.: PS 189/12/2025; ..."
// ============================================
interface ParsedTransactionDetails {
  idIph: string | null           // Full ID IPH value (e.g., "XX009512412845")
  senderSubaccount: string | null // Last 12 digits of ID IPH for matching
  senderName: string | null       // Name from "od:" field
  senderAccount: string | null    // Account from "z rach.:" field
  title: string | null            // Title from "tyt.:" field
}

function parseFullDescription(description: string | null): ParsedTransactionDetails {
  const result: ParsedTransactionDetails = {
    idIph: null,
    senderSubaccount: null,
    senderName: null,
    senderAccount: null,
    title: null,
  }

  if (!description) return result

  // Extract ID IPH: XX009512412845
  const idIphMatch = description.match(/ID\s*IPH:\s*([A-Z0-9]+)/i)
  if (idIphMatch) {
    result.idIph = idIphMatch[1]
    // Extract last 12 digits for subaccount matching
    const digits = idIphMatch[1].replace(/\D/g, '')
    if (digits.length >= 12) {
      result.senderSubaccount = digits.slice(-12)
    }
  }

  // Extract sender name from "od:" field
  // Pattern: "od: COMPANY NAME ADDRESS; tyt.:" or "od: COMPANY NAME ADDRESS;"
  const senderMatch = description.match(/od:\s*([^;]+?)(?:;\s*tyt\.|;\s*data|;|$)/i)
  if (senderMatch) {
    // Clean up the name - take only the company name (usually before the address)
    let name = senderMatch[1].trim()
    // Try to extract just the company name (before street address patterns)
    const addressPatterns = /\s+(UL\.|AL\.|PL\.|OS\.|ULICA|ALEJA|PLAC)\s/i
    const addressMatch = name.match(addressPatterns)
    if (addressMatch && addressMatch.index) {
      name = name.substring(0, addressMatch.index).trim()
    }
    result.senderName = name.replace(/\s+/g, ' ').trim()
  }

  // Extract account from "z rach.:" field
  const accountMatch = description.match(/z\s*rach\.?:\s*([0-9\s]+)/i)
  if (accountMatch) {
    result.senderAccount = accountMatch[1].replace(/\s/g, '').trim()
  }

  // Extract title from "tyt.:" field
  const titleMatch = description.match(/tyt\.?:\s*([^;]+?)(?:;\s*data|;\s*TNR|;|$)/i)
  if (titleMatch) {
    result.title = titleMatch[1].trim()
  }

  return result
}

// ============================================
// mBank Corporate CSV Parser (extended format)
// ============================================
export function parseMBankCorporateCSV(content: string): ParseResult<ParsedPayment> {
  const errors: ImportError[] = []
  const warnings: string[] = []
  const data: ParsedPayment[] = []

  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim())

  if (lines.length < 2) {
    return {
      success: false,
      data: [],
      errors: [{ row: 0, field: 'file', message: 'Plik jest pusty lub zawiera tylko nagłówki' }],
      warnings: [],
    }
  }

  // Parse header to find column indices
  const headerLine = lines[0]
  const headers = parseCSVLine(headerLine, ';').map((h) => h.toLowerCase().trim())

  // Find column indices (handle encoding issues with Polish characters)
  // exactMatch: if true, the header must equal the name (not just contain it)
  const findColumn = (names: string[], exactMatch = false): number => {
    for (const name of names) {
      const idx = headers.findIndex((h) =>
        exactMatch ? h === name : h.includes(name)
      )
      if (idx !== -1) return idx
    }
    return -1
  }

  // Find column using regex (for handling encoding issues with Polish characters)
  const findColumnRegex = (patterns: RegExp[]): number => {
    for (const pattern of patterns) {
      const idx = headers.findIndex((h) => pattern.test(h))
      if (idx !== -1) return idx
    }
    return -1
  }

  const amountCol = findColumn(['kwota'])
  const dateCol = findColumn(['data ksi', 'data księgowania'])
  // IMPORTANT: Use exact match for 'kontrahent' to avoid matching 'rachunek kontrahenta'
  const senderNameCol = findColumn(['kontrahent'], true)
  const senderAccountCol = findColumn(['rachunek kontrahenta'])
  // Title column - use regex to match exactly "opis transakcji" but not "pełny opis transakcji"
  // The regex anchors ensure we match only columns that are exactly "opis transakcji"
  const titleCol = findColumnRegex([/^opis transakcji$/])
  // Handle various encodings of Polish characters (ę can appear as various characters)
  // Use regex with . to match any character in place of ę/ł
  const fullDescCol = findColumnRegex([
    /pe.ny opis transakcji/,   // Matches pełny, pelny, pe?ny, pe�ny, etc.
    /pe.ny opis/,              // Shorter variant
    /full.*description/i,      // English variant (just in case)
  ])
  const sideCol = findColumn(['strona transakcji'])
  const currencyCol = findColumn(['waluta'])
  const referenceCol = findColumn(['id transakcji', 'referencje'])
  // "Numer rachunku" - the account that received the payment (our subaccount)
  const receiverAccountCol = findColumn(['numer rachunku'])

  if (amountCol === -1 || dateCol === -1) {
    return {
      success: false,
      data: [],
      errors: [{ row: 0, field: 'format', message: 'Nie znaleziono wymaganych kolumn (Kwota, Data księgowania)' }],
      warnings: [],
    }
  }

  let excludedVatCount = 0

  // Process data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const rowNumber = i + 1
    const values = parseCSVLine(line, ';')

    // Check if this is a credit (incoming payment) - "Uznania"
    if (sideCol !== -1) {
      const side = values[sideCol]?.toLowerCase() || ''
      if (side.includes('obci') || side.includes('debit')) {
        // Skip debits (outgoing payments)
        continue
      }
    }

    // Check receiver account - skip technical VAT accounts
    if (receiverAccountCol !== -1) {
      const receiverAccount = values[receiverAccountCol]?.replace(/'/g, '').replace(/\s/g, '').trim()
      if (receiverAccount && EXCLUDED_RECEIVER_ACCOUNTS.includes(receiverAccount)) {
        excludedVatCount++
        continue
      }
    }

    // Check title for VAT transfer patterns
    const titleForCheck = titleCol !== -1 ? values[titleCol]?.toLowerCase() || '' : ''
    const fullDescForCheck = fullDescCol !== -1 ? values[fullDescCol]?.toLowerCase() || '' : ''
    const isVatTransfer = EXCLUDED_TITLE_PATTERNS.some(
      pattern => titleForCheck.includes(pattern) || fullDescForCheck.includes(pattern)
    )
    if (isVatTransfer) {
      excludedVatCount++
      continue
    }

    // Parse amount
    const amount = parsePolishAmount(values[amountCol])
    if (amount === null || amount <= 0) {
      // Skip outgoing payments (negative amounts) or invalid
      continue
    }

    // Parse date (DD/MM/YYYY format)
    const transactionDate = parseDate(values[dateCol])
    if (!transactionDate) {
      errors.push({
        row: rowNumber,
        field: 'transaction_date',
        message: 'Nieprawidłowy format daty',
        value: values[dateCol],
      })
      continue
    }

    // Parse full description to extract ID IPH, sender account, etc.
    const fullDescription = fullDescCol !== -1 ? values[fullDescCol] : null
    const parsedDetails = parseFullDescription(fullDescription)

    // Extract sender info - ALWAYS prefer "Kontrahent" column (this has the actual company name)
    // Only fallback to parsed "od:" from full description if Kontrahent is empty
    let senderName = senderNameCol !== -1 ? values[senderNameCol]?.trim() : null
    if (!senderName || senderName.startsWith("'") || /^\d+$/.test(senderName.replace(/'/g, ''))) {
      // Kontrahent is empty or looks like an account number, try parsed name
      senderName = parsedDetails.senderName || senderName
    }
    // Remove extra spaces and clean up company names
    senderName = senderName?.replace(/'/g, '').replace(/\s+/g, ' ').trim() || 'Nieznany'

    // Sender account - prefer from full description (z rach.:), fallback to "Rachunek kontrahenta" column
    let senderAccount = parsedDetails.senderAccount
    if (!senderAccount) {
      senderAccount = senderAccountCol !== -1 ? values[senderAccountCol]?.trim() : null
    }
    // Remove quotes from account number
    senderAccount = senderAccount?.replace(/'/g, '').trim() || null

    // Extract title/description - prefer "Opis transakcji" column, fallback to parsed "tyt.:" from full description
    let title = titleCol !== -1 ? values[titleCol]?.trim() : null
    if (!title) {
      title = parsedDetails.title
    }
    title = title?.replace(/\s+/g, ' ').trim() || 'Brak tytułu'

    // Currency
    const currency = currencyCol !== -1 ? values[currencyCol]?.trim().toUpperCase() : 'PLN'

    // Reference
    let reference = referenceCol !== -1 ? values[referenceCol]?.trim() : null
    if (!reference) {
      reference = generateReference(transactionDate, amount, senderName)
    }

    // Sender subaccount - use last 12 digits from ID IPH for matching
    // This matches with buyer_subaccount from invoices
    let senderSubaccount = parsedDetails.senderSubaccount

    // Fallback: If no ID IPH, try sender account column (rachunek kontrahenta)
    // This is the counterparty's account number, NOT our account (numer rachunku)
    if (!senderSubaccount && senderAccountCol !== -1) {
      const counterpartyAccount = values[senderAccountCol]?.trim()?.replace(/'/g, '').replace(/\s/g, '').trim()
      if (counterpartyAccount) {
        // Extract last 12 digits from counterparty's account
        const digits = counterpartyAccount.replace(/\D/g, '')
        if (digits.length >= 12) {
          senderSubaccount = digits.slice(-12)
        }
      }
    }

    data.push({
      transaction_date: transactionDate,
      amount,
      currency: currency || 'PLN',
      sender_name: senderName,
      sender_account: senderAccount,
      title,
      extended_title: fullDescription || null, // Full transaction description (Pełny opis transakcji)
      reference,
      sender_subaccount: senderSubaccount, // Last 12 digits from ID IPH for matching
    })
  }

  if (data.length === 0 && errors.length === 0) {
    warnings.push('Nie znaleziono transakcji przychodzących (uznań) w pliku')
  }

  if (excludedVatCount > 0) {
    warnings.push(`Pominięto ${excludedVatCount} płatności na rachunek techniczny VAT`)
  }

  return {
    success: errors.length === 0,
    data,
    errors,
    warnings,
  }
}

// ============================================
// ING CSV Parser
// ============================================
export function parseINGCSV(content: string): ParseResult<ParsedPayment> {
  const errors: ImportError[] = []
  const warnings: string[] = []
  const data: ParsedPayment[] = []

  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim())

  if (lines.length < 2) {
    return {
      success: false,
      data: [],
      errors: [{ row: 0, field: 'file', message: 'Plik jest pusty lub zawiera tylko nagłówki' }],
      warnings: [],
    }
  }

  let excludedVatCount = 0

  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const rowNumber = i + 1
    const values = parseCSVLine(line, ';')

    // ING format:
    // Data transakcji;Data księgowania;Dane kontrahenta;Tytuł;Nr rachunku;Kwota transakcji;Waluta
    // Index:    0            1                2            3         4             5           6

    const transactionDate = parseDate(values[0])
    if (!transactionDate) {
      errors.push({
        row: rowNumber,
        field: 'transaction_date',
        message: 'Nieprawidłowy format daty',
        value: values[0],
      })
      continue
    }

    const amount = parsePolishAmount(values[5])
    if (amount === null || amount <= 0) {
      // Skip outgoing payments (negative amounts)
      continue
    }

    // Check title for VAT transfer patterns
    const titleForCheck = values[3]?.toLowerCase() || ''
    const isVatTransfer = EXCLUDED_TITLE_PATTERNS.some(pattern => titleForCheck.includes(pattern))
    if (isVatTransfer) {
      excludedVatCount++
      continue
    }

    const senderName = values[2]?.trim() || 'Nieznany'
    const senderAccount = values[4]?.trim() || null
    const title = values[3]?.trim() || 'Brak tytułu'
    const currency = values[6]?.trim().toUpperCase() || 'PLN'

    data.push({
      transaction_date: transactionDate,
      amount,
      currency,
      sender_name: senderName,
      sender_account: senderAccount,
      title,
      reference: generateReference(transactionDate, amount, senderName),
    })
  }

  if (excludedVatCount > 0) {
    warnings.push(`Pominięto ${excludedVatCount} płatności na rachunek techniczny VAT`)
  }

  return {
    success: errors.length === 0,
    data,
    errors,
    warnings,
  }
}

// ============================================
// Helper: Parse mBank SME description field
// ============================================
interface ParsedSMEDescription {
  senderName: string | null
  title: string | null
  senderAccount: string | null
  senderSubaccount: string | null
}

/**
 * Parse mBank SME "Opis operacji" field which contains:
 * - Sender name (company name before address patterns)
 * - Payment title (invoice numbers, descriptions)
 * - Sender account (26 digits at end)
 */
function parseSMEDescription(description: string | null): ParsedSMEDescription {
  const result: ParsedSMEDescription = {
    senderName: null,
    title: null,
    senderAccount: null,
    senderSubaccount: null,
  }

  if (!description) return result

  // Extract 26-digit account number at end (with possible trailing spaces)
  const accountMatch = description.match(/(\d{26})\s*$/)
  if (accountMatch) {
    result.senderAccount = accountMatch[1]
    result.senderSubaccount = accountMatch[1].slice(-12)
  }

  // Split by comma - first part usually has company name + address
  const parts = description.split(',')
  if (parts.length >= 1) {
    // Extract company name (before address patterns like UL., AL., PL.)
    const firstPart = parts[0].trim()
    const addressPatterns = /\s+(UL\.|AL\.|PL\.|OS\.|ULICA|ALEJA|PLAC)\s/i
    const addressMatch = firstPart.match(addressPatterns)
    if (addressMatch && addressMatch.index) {
      result.senderName = firstPart.substring(0, addressMatch.index).trim()
    } else {
      // No address pattern found - might be short name or different format
      // Take the whole first part but clean it up
      result.senderName = firstPart.replace(/\s+/g, ' ').trim()
    }
  }

  // Extract payment title - look for invoice patterns
  // Pattern 1: "Faktura numer PS 95/11/2025" or "FAKTURA NUMER PS 95/11/2025"
  const invoiceMatch = description.match(/Faktura\s+(?:numer\s+)?([A-Z]{0,5}\s*\d+\/\d+\/\d+)/i)
  if (invoiceMatch) {
    result.title = invoiceMatch[0].trim()
    return result
  }

  // Pattern 2: Just invoice number like "PS 95/11/2025" or "160/12/2025"
  const invoiceNumMatch = description.match(/([A-Z]{1,5}\s+)?\d+\/\d+\/\d{4}/i)
  if (invoiceNumMatch) {
    result.title = invoiceNumMatch[0].trim()
    return result
  }

  // Pattern 3: FV format like "FV/123/2025"
  const fvMatch = description.match(/FV[\s\/]?\d+[\s\/]\d+[\s\/]?\d*/i)
  if (fvMatch) {
    result.title = fvMatch[0].trim()
    return result
  }

  // If no invoice pattern found, try to extract title from after comma
  if (parts.length >= 2) {
    let titlePart = parts[1].trim()
    // Remove common suffixes like "PRZELEW ZEWNĘTRZNY PRZYCHODZĄCY" and account number
    titlePart = titlePart
      .replace(/PRZELEW\s+(ZEWN[ĘE]TRZNY|WEWN[ĘE]TRZNY)\s+PRZYCHODZ[ĄA]CY/gi, '')
      .replace(/\d{26}\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (titlePart) {
      result.title = titlePart
    }
  }

  return result
}

// ============================================
// mBank SME CSV Parser (MŚP format)
// ============================================
export function parseMBankSMECSV(content: string): ParseResult<ParsedPayment> {
  const errors: ImportError[] = []
  const warnings: string[] = []
  const data: ParsedPayment[] = []

  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

  // Find the data header line (starts with #Data operacji;#Opis operacji;#Rachunek)
  // The header section can vary in length, so we search for it
  let dataStartIndex = -1
  for (let i = 0; i < Math.min(lines.length, 50); i++) {
    const line = lines[i].trim().toLowerCase()
    if (line.startsWith('#data operacji') &&
        line.includes('#opis operacji') &&
        line.includes('#rachunek') &&
        line.includes('#kategoria') &&
        line.includes('#kwota')) {
      dataStartIndex = i + 1
      break
    }
  }

  if (dataStartIndex === -1) {
    return {
      success: false,
      data: [],
      errors: [{ row: 0, field: 'format', message: 'Nie znaleziono nagłówków danych mBank MŚP' }],
      warnings: [],
    }
  }

  let excludedVatCount = 0
  let excludedOwnTransferCount = 0

  // Process data rows
  for (let i = dataStartIndex; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const rowNumber = i + 1
    const values = parseCSVLine(line, ';')

    // mBank SME format columns:
    // #Data operacji;#Opis operacji;#Rachunek;#Kategoria;#Kwota;
    // Index:    0           1           2          3        4

    if (values.length < 5) continue

    // Parse date (YYYY-MM-DD format)
    const transactionDate = parseDate(values[0])
    if (!transactionDate) {
      errors.push({
        row: rowNumber,
        field: 'transaction_date',
        message: 'Nieprawidłowy format daty',
        value: values[0],
      })
      continue
    }

    // Parse amount - format: "734,73 PLN" or "50 000,00 PLN"
    const amountStr = values[4]?.replace(/PLN/gi, '').trim()
    const amount = parsePolishAmount(amountStr)
    if (amount === null || amount <= 0) {
      // Skip outgoing payments (negative amounts)
      continue
    }

    // Check category and description for filtering
    const category = values[3]?.toLowerCase() || ''
    const description = values[1] || ''
    const descLower = description.toLowerCase()

    // Filter VAT transfers
    const isVatTransfer =
      descLower.includes('pp/przelew vat') ||
      (category.includes('przelew własny') && descLower.includes('vat')) ||
      EXCLUDED_TITLE_PATTERNS.some(pattern => descLower.includes(pattern))

    if (isVatTransfer) {
      excludedVatCount++
      continue
    }

    // Filter internal transfers between own accounts
    if (descLower.includes('przelew wewnatrz wlasnych kont') ||
        descLower.includes('przelew wewnątrz własnych kont')) {
      excludedOwnTransferCount++
      continue
    }

    // Parse the description field to extract sender info, title, account
    const parsed = parseSMEDescription(description)

    const senderName = parsed.senderName || 'Nieznany'
    const title = parsed.title || description.substring(0, 100) || 'Brak tytułu'
    const senderAccount = parsed.senderAccount
    const senderSubaccount = parsed.senderSubaccount

    data.push({
      transaction_date: transactionDate,
      amount,
      currency: 'PLN',
      sender_name: senderName,
      sender_account: senderAccount,
      title,
      extended_title: description, // Store full description for reference
      reference: generateReference(transactionDate, amount, senderName),
      sender_subaccount: senderSubaccount,
    })
  }

  if (data.length === 0 && errors.length === 0) {
    warnings.push('Nie znaleziono transakcji przychodzących w pliku')
  }

  if (excludedVatCount > 0) {
    warnings.push(`Pominięto ${excludedVatCount} płatności VAT`)
  }

  if (excludedOwnTransferCount > 0) {
    warnings.push(`Pominięto ${excludedOwnTransferCount} przelewów wewnętrznych między własnymi kontami`)
  }

  return {
    success: errors.length === 0,
    data,
    errors,
    warnings,
  }
}

// ============================================
// Helper: Parse Pekao SA sender name from two columns
// ============================================
interface ParsedPekaoSender {
  senderName: string
  fullDescription: string
}

/**
 * Parse Pekao SA sender name from columns 2+3
 * Column 2 contains truncated name, column 3 contains continuation + address
 * Example:
 * - Col 2: "PERFECTINFO SPÓŁKA Z OGRANICZONĄ OD"
 * - Col 3: "POWIEDZIALNOŚCIĄ UL.ZĄBKOWSKA 31 03-736 WARSZAWA"
 * - Result: "PERFECTINFO SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ"
 */
function parsePekaoSender(col2: string, col3: string): ParsedPekaoSender {
  // Combine both columns
  const combined = `${col2 || ''} ${col3 || ''}`.replace(/\s+/g, ' ').trim()

  // Extract company name before address patterns
  const addressPatterns = /\s+(UL\.|AL\.|PL\.|OS\.|ULICA|ALEJA|PLAC|NR\s+\d|\d{2}-\d{3})/i
  const addressMatch = combined.match(addressPatterns)

  let senderName = combined
  if (addressMatch && addressMatch.index) {
    senderName = combined.substring(0, addressMatch.index).trim()
  }

  // Clean up the name
  senderName = senderName.replace(/\s+/g, ' ').trim()

  return {
    senderName: senderName || 'Nieznany',
    fullDescription: combined,
  }
}

/**
 * Parse Pekao SA VAT split payment title
 * Format: /VAT/115,00/IDC/5222755233/INV/4/12/2025/TXT/4/12/2025
 * Extracts: title from /TXT/ or /INV/, extended_title as full string
 *
 * IMPORTANT: The /INV/ and /TXT/ sections often contain dates like 7/11/2025
 * which include slashes. We must NOT stop at the first slash!
 */
interface ParsedPekaoTitle {
  title: string
  extendedTitle: string | null
}

function parsePekaoTitle(rawTitle: string): ParsedPekaoTitle {
  if (!rawTitle) {
    return { title: 'Brak tytułu', extendedTitle: null }
  }

  const title = rawTitle.trim()

  // Check if it's a VAT split payment format
  if (title.startsWith('/VAT/') || title.includes('/IDC/') || title.includes('/INV/')) {
    // Extract title from /TXT/ section - everything after /TXT/ until end of string
    // The content may contain slashes (e.g., dates like 7/11/2025)
    const txtIndex = title.indexOf('/TXT/')
    if (txtIndex !== -1) {
      const txtContent = title.substring(txtIndex + 5).trim() // Skip "/TXT/"
      if (txtContent) {
        return {
          title: txtContent,
          extendedTitle: title,
        }
      }
    }

    // Fallback: extract from /INV/ section - content between /INV/ and /TXT/ (or end)
    const invIndex = title.indexOf('/INV/')
    if (invIndex !== -1) {
      let invContent: string
      if (txtIndex !== -1 && txtIndex > invIndex) {
        // Extract between /INV/ and /TXT/
        invContent = title.substring(invIndex + 5, txtIndex).trim()
      } else {
        // No /TXT/, extract until end
        invContent = title.substring(invIndex + 5).trim()
      }
      if (invContent) {
        return {
          title: invContent,
          extendedTitle: title,
        }
      }
    }
  }

  // Not a VAT split format - return as is
  return {
    title: title,
    extendedTitle: null,
  }
}

// ============================================
// Pekao SA CSV Parser
// ============================================
export function parsePekaoCSV(content: string): ParseResult<ParsedPayment> {
  const errors: ImportError[] = []
  const warnings: string[] = []
  const data: ParsedPayment[] = []

  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim())

  if (lines.length < 2) {
    return {
      success: false,
      data: [],
      errors: [{ row: 0, field: 'file', message: 'Plik jest pusty lub zawiera tylko nagłówki' }],
      warnings: [],
    }
  }

  // Verify header line
  const headerLine = lines[0].toLowerCase()
  if (!headerLine.includes('data księgowania') && !headerLine.includes('data ksiegowania')) {
    return {
      success: false,
      data: [],
      errors: [{ row: 0, field: 'format', message: 'Nieprawidłowy nagłówek pliku Pekao SA' }],
      warnings: [],
    }
  }

  let excludedVatCount = 0

  // Process data rows (skip header)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const rowNumber = i + 1
    const values = parseCSVLine(line, ';')

    // Pekao SA CSV format (11 columns):
    // Data księgowania;Data waluty;Nadawca/Odbiorca;Adres nadawcy/odbiorcy;Rachunek źródłowy;
    // Rachunek docelowy;Tytułem;Kwota operacji;Waluta;Numer referencyjny;Typ operacji
    // Index: 0;1;2;3;4;5;6;7;8;9;10

    if (values.length < 9) {
      warnings.push(`Wiersz ${rowNumber}: niepełne dane (${values.length} kolumn zamiast 11)`)
      continue
    }

    // Parse date (DD.MM.YYYY format)
    const transactionDate = parseDate(values[0])
    if (!transactionDate) {
      errors.push({
        row: rowNumber,
        field: 'transaction_date',
        message: 'Nieprawidłowy format daty',
        value: values[0],
      })
      continue
    }

    // Parse amount - format: "1 476,00" (space as thousands separator, comma as decimal)
    const amount = parsePolishAmount(values[7])
    if (amount === null || amount <= 0) {
      // Skip outgoing payments (negative amounts) or invalid
      continue
    }

    // Get operation type
    const operationType = values[10]?.toLowerCase() || ''
    const rawTitle = values[6]?.trim() || ''
    const titleLower = rawTitle.toLowerCase()

    // Filter own VAT transfers
    // Type: "PRZELEW PODZIELONY UZNANIE VAT" with /TI/ in title (VAT return to own account)
    if (operationType.includes('uznanie vat') && titleLower.includes('/ti/')) {
      excludedVatCount++
      continue
    }

    // Filter standard VAT transfers
    if (EXCLUDED_TITLE_PATTERNS.some(pattern => titleLower.includes(pattern))) {
      excludedVatCount++
      continue
    }

    // Parse sender name from columns 2+3
    const parsedSender = parsePekaoSender(values[2], values[3])

    // Parse title (handle VAT split format)
    const parsedTitle = parsePekaoTitle(rawTitle)

    // Get sender account (remove leading apostrophe)
    let senderAccount = values[4]?.replace(/^'+/, '').trim() || null
    // Extract sender subaccount (last 12 digits)
    let senderSubaccount: string | null = null
    if (senderAccount) {
      const digits = senderAccount.replace(/\D/g, '')
      if (digits.length >= 12) {
        senderSubaccount = digits.slice(-12)
      }
    }

    // Get reference (remove leading apostrophe)
    let reference = values[9]?.replace(/^'+/, '').trim() || null
    if (!reference) {
      reference = generateReference(transactionDate, amount, parsedSender.senderName)
    }

    // Get currency
    const currency = values[8]?.trim().toUpperCase() || 'PLN'

    data.push({
      transaction_date: transactionDate,
      amount,
      currency,
      sender_name: parsedSender.senderName,
      sender_account: senderAccount,
      title: parsedTitle.title,
      extended_title: parsedTitle.extendedTitle,
      reference,
      sender_subaccount: senderSubaccount,
    })
  }

  if (data.length === 0 && errors.length === 0) {
    warnings.push('Nie znaleziono transakcji przychodzących w pliku')
  }

  if (excludedVatCount > 0) {
    warnings.push(`Pominięto ${excludedVatCount} przelewów VAT`)
  }

  return {
    success: errors.length === 0,
    data,
    errors,
    warnings,
  }
}

// ============================================
// PKO Bank Polski CSV Parser
// iPKO Biznes format with separate columns
// Header: Data księgowania;Data waluty;Nadawca;Adres nadawcy;Rachunek;Rachunek;Tytułem;Kwota operacji;Waluta;Numer referencyjny;Typ operacji
// Indices:      0              1          2          3          4         5        6          7         8           9              10
// ============================================
export function parsePKOCSV(content: string): ParseResult<ParsedPayment> {
  const errors: ImportError[] = []
  const warnings: string[] = []
  const data: ParsedPayment[] = []

  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim())

  if (lines.length < 2) {
    return {
      success: false,
      data: [],
      errors: [{ row: 0, field: 'file', message: 'Plik jest pusty lub zawiera tylko nagłówki' }],
      warnings: [],
    }
  }

  // Parse header to find column indices
  const headerLine = lines[0]
  const headers = parseCSVLine(headerLine, ';').map((h) =>
    h.toLowerCase().replace(/"/g, '').trim()
  )

  // Debug: log headers for troubleshooting
  warnings.push(`Nagłówki (${headers.length} kolumn): ${headers.slice(0, 8).join(' | ')}...`)

  // Find column indices - helper with partial match
  // Handles various encoding issues (ę→Ä™, ł→Å‚, etc.)
  const findColumn = (names: string[]): number => {
    for (const name of names) {
      const idx = headers.findIndex((h) => h.includes(name))
      if (idx !== -1) return idx
    }
    return -1
  }

  // Try to find columns with multiple encoding variants
  // Polish characters can be encoded differently: ę, ł, ą, ó, etc.
  let dateCol = findColumn([
    'data księgowania', 'data ksiegowania', 'data ksi',
    'data księ', 'data ksie', // encoding issues
  ])

  let amountCol = findColumn([
    'kwota operacji', 'kwota ope', 'kwota op',
  ])

  let currencyCol = findColumn(['waluta'])

  // CRITICAL: "Tytułem" column - index 6 in iPKO Biznes
  // Handle various encodings: ł can appear as Å‚, ę as Ä™
  let titleCol = findColumn([
    'tytułem', 'tytulem', 'tytul', 'tytu',
    'tytuå', // ł encoded as Å‚ in some cases
  ])

  let senderNameCol = findColumn(['nadawca'])

  // First "rachunek" column is sender's account (index 4)
  let senderAccountCol = headers.findIndex((h) => h.includes('rachunek'))

  let referenceCol = findColumn([
    'numer referencyjny', 'numer ref', 'numer re',
  ])

  // FALLBACK: If column detection failed, use hardcoded indices for iPKO Biznes
  // This handles cases where encoding is completely broken
  const useHardcodedIndices = dateCol === -1 || amountCol === -1 || titleCol === -1

  if (useHardcodedIndices && headers.length >= 11) {
    warnings.push('Używam hardcoded indeksów (problemy z kodowaniem nagłówków)')
    // iPKO Biznes standard layout:
    // 0: Data księgowania, 1: Data waluty, 2: Nadawca, 3: Adres nadawcy
    // 4: Rachunek (sender), 5: Rachunek (receiver), 6: Tytułem, 7: Kwota operacji
    // 8: Waluta, 9: Numer referencyjny, 10: Typ operacji
    dateCol = 0
    senderNameCol = 2
    senderAccountCol = 4
    titleCol = 6      // TYTUŁEM - this is the payment title!
    amountCol = 7     // KWOTA OPERACJI
    currencyCol = 8
    referenceCol = 9
  }

  // Log detected columns for debugging
  warnings.push(`Kolumny: data=${dateCol}, tytuł=${titleCol}, kwota=${amountCol}, nadawca=${senderNameCol}`)

  if (dateCol === -1 || amountCol === -1) {
    return {
      success: false,
      data: [],
      errors: [{
        row: 0,
        field: 'format',
        message: `Nie znaleziono wymaganych kolumn PKO. Wykryte kolumny: ${headers.join(', ')}`,
      }],
      warnings,
    }
  }

  if (titleCol === -1) {
    warnings.push('⚠️ Nie znaleziono kolumny Tytułem - tytuły mogą być puste')
  }

  let excludedVatCount = 0

  // Process data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const rowNumber = i + 1
    const values = parseCSVLine(line, ';').map(v => v.replace(/^"+|"+$/g, '').trim())

    // Debug first row
    if (i === 1) {
      warnings.push(`Pierwszy wiersz (${values.length} wartości): [${titleCol}]="${values[titleCol] || '(puste)'}"`)
    }

    // Parse date
    const transactionDate = parseDate(values[dateCol])
    if (!transactionDate) {
      errors.push({
        row: rowNumber,
        field: 'transaction_date',
        message: 'Nieprawidłowy format daty',
        value: values[dateCol],
      })
      continue
    }

    // Parse amount
    const amount = parsePolishAmount(values[amountCol])
    if (amount === null || amount <= 0) {
      // Skip outgoing payments (negative amounts)
      continue
    }

    // Read title from Tytułem column (index 6)
    const title = titleCol !== -1 && values[titleCol] ? values[titleCol] : ''

    // Read sender name from Nadawca column (index 2)
    const senderName = senderNameCol !== -1 && values[senderNameCol]
      ? values[senderNameCol]
      : 'Nieznany'

    // Read sender account from first Rachunek column (index 4)
    let senderAccount: string | null = null
    let senderSubaccount: string | null = null
    if (senderAccountCol !== -1 && values[senderAccountCol]) {
      const accountDigits = values[senderAccountCol].replace(/\D/g, '')
      if (accountDigits.length >= 12) {
        senderAccount = accountDigits
        senderSubaccount = accountDigits.slice(-12)
      }
    }

    // Build extended title from all available info for matching
    const extendedTitle = [title, senderName, senderAccount || ''].filter(Boolean).join(' | ')

    // Check for VAT transfer patterns
    const titleLower = title.toLowerCase()
    const isVatTransfer = EXCLUDED_TITLE_PATTERNS.some(pattern => titleLower.includes(pattern))
    if (isVatTransfer) {
      excludedVatCount++
      continue
    }

    // Currency
    const currency = currencyCol !== -1 && values[currencyCol]
      ? values[currencyCol].toUpperCase()
      : 'PLN'

    // Reference
    let reference = referenceCol !== -1 ? values[referenceCol] : null
    if (!reference) {
      reference = generateReference(transactionDate, amount, senderName)
    }

    data.push({
      transaction_date: transactionDate,
      amount,
      currency: currency || 'PLN',
      sender_name: senderName,
      sender_account: senderAccount,
      title: title || 'Brak tytułu',
      extended_title: extendedTitle,
      reference,
      sender_subaccount: senderSubaccount,
    })
  }

  if (data.length === 0 && errors.length === 0) {
    warnings.push('Nie znaleziono transakcji przychodzących w pliku')
  }

  if (excludedVatCount > 0) {
    warnings.push(`Pominięto ${excludedVatCount} przelewów VAT`)
  }

  return {
    success: errors.length === 0,
    data,
    errors,
    warnings,
  }
}

// ============================================
// Auto-detect bank format
// ============================================
export function detectBankFormat(content: string): ImportSource | 'mbank_corporate' | 'mbank_sme' | 'pko' | 'unknown' {
  // MT940: check first 5 lines (headers are at top)
  const firstLines = content.split('\n').slice(0, 5).join('\n').toLowerCase()

  // MT940 format detection
  if (firstLines.includes(':20:') && firstLines.includes(':25:')) {
    return 'mt940'
  }

  // For CSV formats, check more lines (mBank SME has ~27 lines of header)
  const extendedLines = content.split('\n').slice(0, 35).join('\n').toLowerCase()

  // mBank Corporate CSV detection (extended format with ERP codes)
  if (extendedLines.includes('kod transakcji erp') ||
      extendedLines.includes('kod transakcji mbank') ||
      (extendedLines.includes('strona transakcji') && extendedLines.includes('kontrahent'))) {
    return 'mbank_corporate'
  }

  // mBank SME (MŚP) CSV detection - 5 columns, has #Kategoria, no #Data księgowania
  // Header: #Data operacji;#Opis operacji;#Rachunek;#Kategoria;#Kwota;
  if (extendedLines.includes('#data operacji') &&
      extendedLines.includes('#opis operacji') &&
      extendedLines.includes('#kategoria') &&
      !extendedLines.includes('#data księgowania') &&
      !extendedLines.includes('#nadawca/odbiorca')) {
    return 'mbank_sme'
  }

  // mBank standard CSV detection - 8 columns, has #Data księgowania
  // Header: #Data operacji;#Data księgowania;#Opis operacji;#Tytuł;#Nadawca/Odbiorca;...
  if (extendedLines.includes('#data operacji') && extendedLines.includes('#data księgowania')) {
    return 'mbank'
  }

  // Fallback for mBank formats without księgowania check
  if (extendedLines.includes('#data operacji') && extendedLines.includes('#nadawca/odbiorca')) {
    return 'mbank'
  }

  // ING CSV detection
  if (extendedLines.includes('data transakcji') && extendedLines.includes('dane kontrahenta')) {
    return 'ing'
  }

  // Pekao SA CSV detection
  // Header: Data księgowania;Data waluty;Nadawca / Odbiorca;Adres nadawcy / odbiorcy;Rachunek źródłowy;Rachunek docelowy;Tytułem;Kwota operacji;Waluta;Numer referencyjny;Typ operacji
  if ((extendedLines.includes('data księgowania') || extendedLines.includes('data ksiegowania')) &&
      (extendedLines.includes('nadawca / odbiorca') || extendedLines.includes('nadawca/odbiorca')) &&
      (extendedLines.includes('rachunek źródłowy') || extendedLines.includes('rachunek zrodlowy')) &&
      extendedLines.includes('typ operacji')) {
    return 'pekao'
  }

  // PKO Bank Polski CSV detection (iPKO Biznes)
  // Header: "Data księgowania";"Data waluty";"Nadawca";"Adres nadawcy";"Rachunek";"Rachunek";"Tytułem";"Kwota operacji";"Waluta";"Numer referencyjny";"Typ operacji"
  // Key markers: "tytułem" or "tytu" (unique to PKO), "nadawca" (single word), "kwota ope"

  // Detection with various encoding variants (ę→Ä™, ł→Å‚, etc.)
  const hasPKODateCol = extendedLines.includes('data księgowania') ||
                        extendedLines.includes('data ksiegowania') ||
                        extendedLines.includes('data ksi')

  const hasPKOTitleCol = extendedLines.includes('tytułem') ||
                         extendedLines.includes('tytulem') ||
                         extendedLines.includes('tytu') ||
                         extendedLines.includes('tytuå') // ł encoded as Å‚

  const hasPKOAmountCol = extendedLines.includes('kwota ope') ||
                          extendedLines.includes('kwota operacji')

  const hasPKOSenderCol = extendedLines.includes('nadawca') &&
                          !extendedLines.includes('nadawca / odbiorca') &&
                          !extendedLines.includes('nadawca/odbiorca')

  // Exclude Pekao SA (has "rachunek źródłowy")
  const isPekao = extendedLines.includes('rachunek źródłowy') ||
                  extendedLines.includes('rachunek zrodlowy')

  if (hasPKODateCol && hasPKOTitleCol && hasPKOAmountCol && !isPekao) {
    return 'pko'
  }

  // Fallback: detect by structure (11 semicolon-separated columns with specific pattern)
  // This handles cases where encoding is completely broken
  const firstLine = content.split('\n')[0] || ''
  const semicolonCount = (firstLine.match(/;/g) || []).length
  if (semicolonCount === 10 && // 11 columns = 10 semicolons
      hasPKOSenderCol &&
      !isPekao &&
      !extendedLines.includes('#data') && // Not mBank
      !extendedLines.includes('kontrahent')) { // Not mBank Corporate
    return 'pko'
  }

  return 'unknown'
}

// ============================================
// Universal payment parser
// ============================================
export function parsePayments(content: string, format?: ImportSource): ParseResult<ParsedPayment> & {
  detectedFormat: ImportSource | 'mbank_corporate' | 'mbank_sme' | 'pko' | 'unknown'
} {
  const detectedFormat = format || detectBankFormat(content)

  switch (detectedFormat) {
    case 'mt940':
      return { ...parseMT940(content), detectedFormat }
    case 'mbank':
      return { ...parseMBankCSV(content), detectedFormat }
    case 'mbank_corporate':
      return { ...parseMBankCorporateCSV(content), detectedFormat }
    case 'mbank_sme':
      return { ...parseMBankSMECSV(content), detectedFormat }
    case 'ing':
      return { ...parseINGCSV(content), detectedFormat }
    case 'pekao':
      return { ...parsePekaoCSV(content), detectedFormat }
    case 'pko':
      return { ...parsePKOCSV(content), detectedFormat }
    default:
      return {
        success: false,
        data: [],
        errors: [
          {
            row: 0,
            field: 'format',
            message: 'Nie rozpoznano formatu pliku. Wspierane formaty: MT940, mBank CSV, mBank MŚP, mBank Corporate, ING CSV, Pekao SA, PKO BP',
          },
        ],
        warnings: [],
        detectedFormat: 'unknown',
      }
  }
}
