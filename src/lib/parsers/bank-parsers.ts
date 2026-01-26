import type { ParsedPayment, ParseResult, ImportError } from '@/types'
import type { ImportSource } from '@/lib/constants'

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

  for (const line of lines) {
    lineNumber++
    const trimmedLine = line.trim()

    // Transaction line :61:
    if (trimmedLine.startsWith(':61:')) {
      // Save previous transaction if exists
      if (currentTransaction && currentTransaction.transaction_date && currentTransaction.amount) {
        const sender = detailsLines.find((l) => l && !l.startsWith(':'))?.trim() || 'Nieznany'
        const titleLines = detailsLines.filter((l) => l && !l.startsWith(':') && l !== sender)

        data.push({
          transaction_date: currentTransaction.transaction_date,
          amount: currentTransaction.amount,
          currency: 'PLN',
          sender_name: sender,
          sender_account: null,
          title: titleLines.join(' ').trim() || 'Brak tytułu',
          reference: currentTransaction.reference || generateReference(
            currentTransaction.transaction_date,
            currentTransaction.amount,
            sender
          ),
        })
      }

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
  if (currentTransaction && currentTransaction.transaction_date && currentTransaction.amount) {
    const sender = detailsLines.find((l) => l && !l.startsWith(':') && !l.match(/^\d{3}/))?.trim() || 'Nieznany'
    const titleLines = detailsLines.filter((l) => l && !l.startsWith(':') && l !== sender && !l.match(/^\d{3}/))

    data.push({
      transaction_date: currentTransaction.transaction_date,
      amount: currentTransaction.amount,
      currency: 'PLN',
      sender_name: sender,
      sender_account: null,
      title: titleLines.join(' ').trim() || 'Brak tytułu',
      reference: currentTransaction.reference || generateReference(
        currentTransaction.transaction_date,
        currentTransaction.amount,
        sender
      ),
    })
  }

  if (data.length === 0 && errors.length === 0) {
    warnings.push('Nie znaleziono transakcji przychodzących (kredytowych) w pliku')
  }

  return {
    success: errors.length === 0,
    data,
    errors,
    warnings,
  }
}

// ============================================
// mBank CSV Parser
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
export function detectBankFormat(content: string): ImportSource | 'unknown' {
  const firstLines = content.split('\n').slice(0, 5).join('\n')

  // MT940 format detection
  if (firstLines.includes(':20:') && firstLines.includes(':25:')) {
    return 'mt940'
  }

  // mBank CSV detection
  if (firstLines.includes('#Data operacji') || firstLines.includes('#Opis operacji')) {
    return 'mbank'
  }

  // ING CSV detection
  if (firstLines.includes('Data transakcji') && firstLines.includes('Dane kontrahenta')) {
    return 'ing'
  }

  return 'unknown'
}

// ============================================
// Universal payment parser
// ============================================
export function parsePayments(content: string, format?: ImportSource): ParseResult<ParsedPayment> & {
  detectedFormat: ImportSource | 'unknown'
} {
  const detectedFormat = format || detectBankFormat(content)

  switch (detectedFormat) {
    case 'mt940':
      return { ...parseMT940(content), detectedFormat }
    case 'mbank':
      return { ...parseMBankCSV(content), detectedFormat }
    case 'ing':
      return { ...parseINGCSV(content), detectedFormat }
    default:
      return {
        success: false,
        data: [],
        errors: [
          {
            row: 0,
            field: 'format',
            message: 'Nie rozpoznano formatu pliku. Wspierane formaty: MT940, mBank CSV, ING CSV',
          },
        ],
        warnings: [],
        detectedFormat: 'unknown',
      }
  }
}
