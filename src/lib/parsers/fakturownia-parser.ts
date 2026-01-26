import type { ParsedInvoice, ParseResult, ImportError } from '@/types'
import { normalizeNip } from '@/lib/utils'

// Expected column headers in Fakturownia export
const EXPECTED_HEADERS = {
  invoiceNumber: ['numer', 'nr faktury', 'numer faktury'],
  issueDate: ['data wystawienia', 'data'],
  dueDate: ['termin płatności', 'termin', 'termin platnosci'],
  netAmount: ['netto', 'kwota netto', 'wartość netto'],
  grossAmount: ['brutto', 'kwota brutto', 'wartość brutto'],
  currency: ['waluta'],
  buyerName: ['nabywca', 'nazwa nabywcy', 'kontrahent'],
  buyerNip: ['nip nabywcy', 'nip', 'nip kontrahenta'],
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

  for (const [key, possibleNames] of Object.entries(EXPECTED_HEADERS)) {
    const index = findColumnIndex(headers, possibleNames)
    if (index === -1) {
      return null
    }
    mapping[key as keyof ColumnMapping] = index
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

    data.push({
      invoice_number: invoiceNumber,
      issue_date: issueDate,
      due_date: dueDate,
      net_amount: Math.round(netAmount * 100) / 100,
      gross_amount: Math.round(grossAmount * 100) / 100,
      currency,
      buyer_name: buyerName,
      buyer_nip: buyerNip,
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
