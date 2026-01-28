import type { ParsedInvoice, ParseResult, ImportError } from '@/types'
import { normalizeNip } from '@/lib/utils'

// ============================================
// Invoice Type Detection
// ============================================

/**
 * Check if invoice number represents a correction invoice (korekta)
 * Correction invoices start with K, e.g.: K1, K2, K3/01/2025, K-123
 */
function isCorrectionInvoice(invoiceNumber: string): boolean {
  const normalized = invoiceNumber.trim().toUpperCase()
  // Starts with K followed by a digit or separator
  return /^K[\d\s\-\/\\_.]/i.test(normalized) || /^K$/i.test(normalized)
}

/**
 * Check if invoice number represents a proforma invoice
 * Proforma patterns:
 * - PS P6/01/2026, PS P11/11/2025 (PS followed by P and number)
 * - P1, P2, P123/01/2025 (just P prefix)
 * - PRO-123, PROFORMA-123
 */
function isProformaInvoice(invoiceNumber: string): boolean {
  const normalized = invoiceNumber.trim().toUpperCase()

  // Pattern: PS P... (PS followed by space/separator and P)
  if (/^PS\s*P[\d\s\-\/\\_.]/i.test(normalized)) {
    return true
  }

  // Pattern: Just P followed by number (P1, P2, P123/01/2025)
  // But NOT patterns like PS, PSA, etc. - only pure P prefix
  if (/^P[\d\s\-\/\\_.]/i.test(normalized) && !/^P[A-Z]/i.test(normalized)) {
    return true
  }

  // Pattern: PRO or PROFORMA prefix
  if (/^PRO[\s\-\/\\_.]?/i.test(normalized) || /^PROFORMA/i.test(normalized)) {
    return true
  }

  return false
}

/**
 * Get the reason why invoice is excluded
 */
function getExclusionReason(invoiceNumber: string): string | null {
  if (isCorrectionInvoice(invoiceNumber)) {
    return 'korekta'
  }
  if (isProformaInvoice(invoiceNumber)) {
    return 'proforma'
  }
  return null
}

// ============================================
// Fakturownia XML Parser
// ============================================

/**
 * Extract text content from an XML element
 */
function getXmlText(element: Element, tagName: string): string | null {
  const el = element.getElementsByTagName(tagName)[0]
  if (!el) return null

  // Check for nil attribute
  const nilAttr = el.getAttribute('nil')
  if (nilAttr === 'true') return null

  return el.textContent?.trim() || null
}

/**
 * Parse amount from XML (decimal type)
 */
function parseXmlAmount(element: Element, tagName: string): number | null {
  const text = getXmlText(element, tagName)
  if (!text) return null

  const amount = parseFloat(text)
  return isNaN(amount) ? null : Math.round(amount * 100) / 100
}

/**
 * Parse Fakturownia XML export
 * Extracts invoices with buyer-mass-payment-code (subaccount)
 */
export function parseFakturowniaXML(content: string): ParseResult<ParsedInvoice> {
  const errors: ImportError[] = []
  const warnings: string[] = []
  const data: ParsedInvoice[] = []

  try {
    // Parse XML
    const parser = new DOMParser()
    const doc = parser.parseFromString(content, 'text/xml')

    // Check for parse errors
    const parseError = doc.querySelector('parsererror')
    if (parseError) {
      return {
        success: false,
        data: [],
        errors: [{ row: 0, field: 'xml', message: 'Nieprawidłowy format XML' }],
        warnings: [],
      }
    }

    // Get all invoice elements
    const invoices = doc.getElementsByTagName('invoice')

    if (invoices.length === 0) {
      return {
        success: false,
        data: [],
        errors: [{ row: 0, field: 'invoices', message: 'Nie znaleziono faktur w pliku XML' }],
        warnings: [],
      }
    }

    for (let i = 0; i < invoices.length; i++) {
      const invoice = invoices[i]
      const rowNumber = i + 1

      // Extract invoice number
      const invoiceNumber = getXmlText(invoice, 'number')
      if (!invoiceNumber) {
        errors.push({
          row: rowNumber,
          field: 'number',
          message: 'Brak numeru faktury',
        })
        continue
      }

      // Skip correction and proforma invoices
      const exclusionReason = getExclusionReason(invoiceNumber)
      if (exclusionReason) {
        warnings.push(`Faktura ${invoiceNumber}: Pominięta (${exclusionReason})`)
        continue
      }

      // Extract dates
      const issueDate = getXmlText(invoice, 'issue-date') || getXmlText(invoice, 'sell-date')
      if (!issueDate) {
        errors.push({
          row: rowNumber,
          field: 'issue_date',
          message: 'Brak daty wystawienia',
        })
        continue
      }

      const dueDate = getXmlText(invoice, 'payment-to')
      if (!dueDate) {
        errors.push({
          row: rowNumber,
          field: 'due_date',
          message: 'Brak terminu płatności',
        })
        continue
      }

      // Extract amounts
      const netAmount = parseXmlAmount(invoice, 'price-net')
      const grossAmount = parseXmlAmount(invoice, 'price-gross')

      if (netAmount === null) {
        errors.push({
          row: rowNumber,
          field: 'net_amount',
          message: 'Nieprawidłowa kwota netto',
        })
        continue
      }

      if (grossAmount === null) {
        errors.push({
          row: rowNumber,
          field: 'gross_amount',
          message: 'Nieprawidłowa kwota brutto',
        })
        continue
      }

      // Extract currency
      const currency = getXmlText(invoice, 'currency')?.toUpperCase() || 'PLN'

      // Extract buyer info
      const buyerName = getXmlText(invoice, 'buyer-name')
      if (!buyerName) {
        errors.push({
          row: rowNumber,
          field: 'buyer_name',
          message: 'Brak nazwy nabywcy',
        })
        continue
      }

      const rawNip = getXmlText(invoice, 'buyer-tax-no')
      const buyerNip = rawNip ? normalizeNip(rawNip) : null

      // Extract subaccount (buyer-mass-payment-code)
      const buyerSubaccount = getXmlText(invoice, 'buyer-mass-payment-code')

      // Extract seller bank account
      const sellerBankAccount = getXmlText(invoice, 'seller-bank-account')

      // Validate NIP if provided
      if (rawNip && (!buyerNip || buyerNip.length !== 10)) {
        warnings.push(`Faktura ${invoiceNumber}: NIP "${rawNip}" może być nieprawidłowy`)
      }

      // Validate date logic
      if (new Date(issueDate) > new Date(dueDate)) {
        warnings.push(`Faktura ${invoiceNumber}: Termin płatności jest wcześniejszy niż data wystawienia`)
      }

      // Check if invoice is already paid
      // Look for paid-price or payment-status fields
      const paidAmount = parseXmlAmount(invoice, 'paid-price') ||
                         parseXmlAmount(invoice, 'paid') ||
                         parseXmlAmount(invoice, 'paid-amount')

      const paymentStatus = getXmlText(invoice, 'payment-status')?.toLowerCase()

      // Skip if fully paid (paid amount equals gross or status is "paid")
      let isAlreadyPaid = false
      if (paidAmount !== null && grossAmount !== null) {
        const diff = Math.abs(paidAmount - grossAmount)
        if (diff < 0.01) {
          isAlreadyPaid = true
          warnings.push(`Faktura ${invoiceNumber}: Pominięta (już opłacona - kwota opłacona: ${paidAmount.toFixed(2)} PLN)`)
        }
      } else if (paymentStatus === 'paid' || paymentStatus === 'oplacona' || paymentStatus === 'opłacona') {
        isAlreadyPaid = true
        warnings.push(`Faktura ${invoiceNumber}: Pominięta (status: opłacona)`)
      }

      // Skip already paid invoices
      if (isAlreadyPaid) {
        continue
      }

      data.push({
        invoice_number: invoiceNumber,
        issue_date: issueDate,
        due_date: dueDate,
        net_amount: netAmount,
        gross_amount: grossAmount,
        currency,
        buyer_name: buyerName,
        buyer_nip: buyerNip,
        buyer_subaccount: buyerSubaccount,
        seller_bank_account: sellerBankAccount,
      })
    }

    return {
      success: errors.length === 0,
      data,
      errors,
      warnings,
    }
  } catch (error) {
    return {
      success: false,
      data: [],
      errors: [{ row: 0, field: 'xml', message: `Błąd parsowania XML: ${error}` }],
      warnings: [],
    }
  }
}

/**
 * Validate Fakturownia XML file
 */
export function validateFakturowniaXML(content: string): {
  valid: boolean
  error?: string
  rowCount?: number
} {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(content, 'text/xml')

    const parseError = doc.querySelector('parsererror')
    if (parseError) {
      return { valid: false, error: 'Nieprawidłowy format XML' }
    }

    const invoices = doc.getElementsByTagName('invoice')
    if (invoices.length === 0) {
      return { valid: false, error: 'Nie znaleziono faktur w pliku' }
    }

    return {
      valid: true,
      rowCount: invoices.length,
    }
  } catch {
    return { valid: false, error: 'Błąd podczas analizy pliku' }
  }
}

/**
 * Detect if content is Fakturownia XML format
 */
export function isFakturowniaXML(content: string): boolean {
  const trimmed = content.trim()
  return (
    trimmed.startsWith('<?xml') &&
    trimmed.includes('<invoices') &&
    trimmed.includes('<invoice>')
  )
}

// ============================================
// Fakturownia CSV Parser
// ============================================

// Expected column headers in Fakturownia export
const EXPECTED_HEADERS = {
  invoiceNumber: ['numer', 'nr faktury', 'numer faktury'],
  issueDate: ['data wystawienia', 'data'],
  dueDate: ['termin płatności', 'termin', 'termin platnosci'],
  netAmount: ['netto', 'kwota netto', 'wartość netto'],
  grossAmount: ['brutto', 'kwota brutto', 'wartość brutto', 'wartość brutto pln'],
  currency: ['waluta'],
  buyerName: ['nabywca', 'nazwa nabywcy', 'kontrahent'],
  buyerNip: ['nip nabywcy', 'nip', 'nip kontrahenta'],
}

// Optional headers for payment status detection
const OPTIONAL_HEADERS = {
  paidAmount: ['kwota opłacona', 'kwota oplacona', 'opłacono', 'oplacono', 'zapłacono', 'zaplacono'],
}

interface ColumnMapping {
  invoiceNumber: number
  issueDate: number
  dueDate: number
  netAmount: number
  grossAmount: number
  currency: number
  buyerName: number
  buyerNip: number
  // Optional columns
  paidAmount?: number
}

function detectDelimiter(content: string): string {
  const firstLine = content.split('\n')[0]
  const semicolonCount = (firstLine.match(/;/g) || []).length
  const commaCount = (firstLine.match(/,/g) || []).length
  return semicolonCount > commaCount ? ';' : ','
}

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

function findColumnIndex(headers: string[], possibleNames: string[]): number {
  const normalizedHeaders = headers.map((h) => h.toLowerCase().trim())

  for (const name of possibleNames) {
    const index = normalizedHeaders.indexOf(name.toLowerCase())
    if (index !== -1) return index
  }

  return -1
}

function detectColumnMapping(headers: string[]): ColumnMapping | null {
  const mapping: Partial<ColumnMapping> = {}

  // Check required headers
  for (const [key, possibleNames] of Object.entries(EXPECTED_HEADERS)) {
    const index = findColumnIndex(headers, possibleNames)
    if (index === -1) {
      return null
    }
    mapping[key as keyof ColumnMapping] = index
  }

  // Check optional headers
  for (const [key, possibleNames] of Object.entries(OPTIONAL_HEADERS)) {
    const index = findColumnIndex(headers, possibleNames)
    if (index !== -1) {
      mapping[key as keyof ColumnMapping] = index
    }
  }

  return mapping as ColumnMapping
}

function parseAmount(value: string): number | null {
  if (!value) return null

  // Remove quotes, spaces, currency symbols
  const cleaned = value
    .replace(/["\s]/g, '')
    .replace(/[A-Za-z]/g, '')
    .replace(/\s/g, '')
    .trim()

  // Handle Polish format (1 234,56) and international format (1,234.56)
  if (cleaned.includes(',') && cleaned.includes('.')) {
    // Both separators present - determine which is decimal
    const lastComma = cleaned.lastIndexOf(',')
    const lastDot = cleaned.lastIndexOf('.')

    if (lastComma > lastDot) {
      // Polish format: 1.234,56
      return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'))
    } else {
      // International format: 1,234.56
      return parseFloat(cleaned.replace(/,/g, ''))
    }
  } else if (cleaned.includes(',')) {
    // Only comma - could be Polish decimal or thousand separator
    const parts = cleaned.split(',')
    if (parts.length === 2 && parts[1].length <= 2) {
      // Polish decimal format: 1234,56
      return parseFloat(cleaned.replace(',', '.'))
    }
    // Thousand separator: 1,234
    return parseFloat(cleaned.replace(/,/g, ''))
  }

  return parseFloat(cleaned)
}

function parseDate(value: string): string | null {
  if (!value) return null

  const cleaned = value.replace(/['"]/g, '').trim()

  // Try ISO format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned
  }

  // Try Polish format: DD.MM.YYYY or DD/MM/YYYY
  const polishMatch = cleaned.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/)
  if (polishMatch) {
    const [, day, month, year] = polishMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  // Try DD-MM-YYYY
  const dashMatch = cleaned.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (dashMatch) {
    const [, day, month, year] = dashMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  return null
}

export function parseFakturowniaCSV(content: string): ParseResult<ParsedInvoice> {
  const errors: ImportError[] = []
  const warnings: string[] = []
  const data: ParsedInvoice[] = []

  // Normalize line endings
  const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalizedContent.split('\n').filter((line) => line.trim())

  if (lines.length === 0) {
    return {
      success: false,
      data: [],
      errors: [{ row: 0, field: 'file', message: 'Plik jest pusty' }],
      warnings: [],
    }
  }

  // Detect delimiter and parse headers
  const delimiter = detectDelimiter(lines[0])
  const headers = parseCSVLine(lines[0], delimiter)

  // Detect column mapping
  const mapping = detectColumnMapping(headers)
  if (!mapping) {
    return {
      success: false,
      data: [],
      errors: [
        {
          row: 1,
          field: 'headers',
          message:
            'Nie rozpoznano formatu pliku. Upewnij się, że plik zawiera nagłówki: Numer, Data wystawienia, Termin płatności, Netto, Brutto, Waluta, Nabywca, NIP nabywcy',
        },
      ],
      warnings: [],
    }
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const rowNumber = i + 1
    const values = parseCSVLine(line, delimiter)

    // Parse invoice number
    const invoiceNumber = values[mapping.invoiceNumber]?.replace(/['"]/g, '').trim()
    if (!invoiceNumber) {
      errors.push({
        row: rowNumber,
        field: 'invoice_number',
        message: 'Brak numeru faktury',
      })
      continue
    }

    // Skip correction and proforma invoices
    const exclusionReason = getExclusionReason(invoiceNumber)
    if (exclusionReason) {
      warnings.push(`Faktura ${invoiceNumber}: Pominięta (${exclusionReason})`)
      continue
    }

    // Parse issue date
    const issueDate = parseDate(values[mapping.issueDate])
    if (!issueDate) {
      errors.push({
        row: rowNumber,
        field: 'issue_date',
        message: 'Nieprawidłowy format daty wystawienia',
        value: values[mapping.issueDate],
      })
      continue
    }

    // Parse due date
    const dueDate = parseDate(values[mapping.dueDate])
    if (!dueDate) {
      errors.push({
        row: rowNumber,
        field: 'due_date',
        message: 'Nieprawidłowy format terminu płatności',
        value: values[mapping.dueDate],
      })
      continue
    }

    // Parse amounts
    const netAmount = parseAmount(values[mapping.netAmount])
    const grossAmount = parseAmount(values[mapping.grossAmount])

    if (netAmount === null || isNaN(netAmount)) {
      errors.push({
        row: rowNumber,
        field: 'net_amount',
        message: 'Nieprawidłowa kwota netto',
        value: values[mapping.netAmount],
      })
      continue
    }

    if (grossAmount === null || isNaN(grossAmount)) {
      errors.push({
        row: rowNumber,
        field: 'gross_amount',
        message: 'Nieprawidłowa kwota brutto',
        value: values[mapping.grossAmount],
      })
      continue
    }

    // Parse currency
    const currency = values[mapping.currency]?.replace(/['"]/g, '').trim().toUpperCase() || 'PLN'

    // Parse buyer info
    const buyerName = values[mapping.buyerName]?.replace(/['"]/g, '').trim()
    if (!buyerName) {
      errors.push({
        row: rowNumber,
        field: 'buyer_name',
        message: 'Brak nazwy nabywcy',
      })
      continue
    }

    const rawNip = values[mapping.buyerNip]?.replace(/['"]/g, '').trim()
    const buyerNip = rawNip ? normalizeNip(rawNip) : null

    // Validate NIP format if provided
    if (rawNip && (!buyerNip || buyerNip.length !== 10)) {
      warnings.push(`Wiersz ${rowNumber}: NIP "${rawNip}" może być nieprawidłowy`)
    }

    // Validate date logic
    if (new Date(issueDate) > new Date(dueDate)) {
      warnings.push(`Wiersz ${rowNumber}: Termin płatności jest wcześniejszy niż data wystawienia`)
    }

    // Check if invoice is already paid (paidAmount === grossAmount)
    // If paid amount column exists and matches gross amount, skip invoice
    let isAlreadyPaid = false
    if (mapping.paidAmount !== undefined) {
      const paidAmount = parseAmount(values[mapping.paidAmount])
      if (paidAmount !== null && !isNaN(paidAmount)) {
        // Compare with tolerance for floating point errors (within 1 cent)
        const diff = Math.abs(paidAmount - grossAmount)
        if (diff < 0.01) {
          isAlreadyPaid = true
          warnings.push(`Faktura ${invoiceNumber}: Pominięta (już opłacona - kwota opłacona: ${paidAmount.toFixed(2)} PLN)`)
        }
      }
    }

    // Skip already paid invoices - they don't need matching
    if (isAlreadyPaid) {
      continue
    }

    data.push({
      invoice_number: invoiceNumber,
      issue_date: issueDate,
      due_date: dueDate,
      net_amount: Math.round(netAmount * 100) / 100,
      gross_amount: Math.round(grossAmount * 100) / 100,
      currency,
      buyer_name: buyerName,
      buyer_nip: buyerNip,
      buyer_subaccount: null, // CSV format doesn't include subaccount
      seller_bank_account: null, // CSV format doesn't include seller bank account
    })
  }

  return {
    success: errors.length === 0,
    data,
    errors,
    warnings,
  }
}

export function validateFakturowniaFile(content: string): {
  valid: boolean
  error?: string
  rowCount?: number
} {
  try {
    const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const lines = normalizedContent.split('\n').filter((line) => line.trim())

    if (lines.length === 0) {
      return { valid: false, error: 'Plik jest pusty' }
    }

    if (lines.length === 1) {
      return { valid: false, error: 'Plik zawiera tylko nagłówki, brak danych' }
    }

    const delimiter = detectDelimiter(lines[0])
    const headers = parseCSVLine(lines[0], delimiter)
    const mapping = detectColumnMapping(headers)

    if (!mapping) {
      return {
        valid: false,
        error: 'Nie rozpoznano formatu pliku Fakturownia',
      }
    }

    return {
      valid: true,
      rowCount: lines.length - 1,
    }
  } catch {
    return {
      valid: false,
      error: 'Błąd podczas analizy pliku',
    }
  }
}
