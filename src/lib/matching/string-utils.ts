/**
 * Normalize string for comparison - remove diacritics, lowercase, trim
 */
export function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[łŁ]/g, 'l')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Normalize payment title by removing spaces that break invoice number patterns.
 * Bank systems sometimes insert random spaces in invoice numbers.
 *
 * Handles cases like:
 * - "PS 1 7/12/2025" → "PS 17/12/2025" (space between digits in sequence number)
 * - "PS 17/12/ 2025" → "PS 17/12/2025" (space after separator before year)
 * - "INV/PS 1 7/12/2025" → "INV/PS 17/12/2025"
 *
 * Does NOT remove spaces in other contexts (e.g., "FIRMA XYZ" stays "FIRMA XYZ")
 */
export function normalizePaymentTitle(title: string): string {
  return title
    // Step 1: Remove spaces between digits (e.g., "1 7" → "17", "1  7" → "17")
    .replace(/(\d)\s+(\d)/g, '$1$2')
    // Step 2: Remove spaces after separators before digits (e.g., "/ 2025" → "/2025")
    .replace(/([\/\\_.\-])\s+(\d)/g, '$1$2')
    // Step 3: Remove spaces before separators after digits (e.g., "17 /" → "17/")
    .replace(/(\d)\s+([\/\\_.\-])/g, '$1$2')
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

/**
 * Calculate similarity between two strings (0-1)
 * Uses normalized Levenshtein distance
 */
export function stringSimilarity(a: string, b: string): number {
  const normalizedA = normalizeString(a)
  const normalizedB = normalizeString(b)

  if (normalizedA === normalizedB) return 1
  if (normalizedA.length === 0 || normalizedB.length === 0) return 0

  const maxLength = Math.max(normalizedA.length, normalizedB.length)
  const distance = levenshteinDistance(normalizedA, normalizedB)

  return 1 - distance / maxLength
}

/**
 * Check if string contains another string (normalized)
 */
export function containsNormalized(haystack: string, needle: string): boolean {
  return normalizeString(haystack).includes(normalizeString(needle))
}

/**
 * Wyciąga numer sekwencyjny z numeru faktury w formacie NN/MM/YYYY
 * Przykłady:
 * - "37/12/2025" → "37"
 * - "PS 37/12/2025" → "37"
 * - "7/12/2025" → "7"
 * - "INV/123/2025" → "123"
 * - "FV 123/2025" → "123"
 */
export function extractSequenceNumber(invoiceNumber: string): string | null {
  if (!invoiceNumber) return null

  // Format 1: NN/MM/YYYY lub prefix + NN/MM/YYYY (np. 37/12/2025, PS 37/12/2025)
  // Szukamy: cyfry + separator + 1-2 cyfry (miesiąc) + separator + 4 cyfry (rok)
  const dateFormatMatch = invoiceNumber.match(/(?:^|[^\d])(\d{1,5})[\s]*[\/\\_.\-][\s]*\d{1,2}[\s]*[\/\\_.\-][\s]*\d{4}/)
  if (dateFormatMatch) {
    return dateFormatMatch[1]
  }

  // Format 2: NN/YYYY (np. 123/2025)
  const shortFormatMatch = invoiceNumber.match(/(?:^|[^\d])(\d{1,5})[\s]*[\/\\_.\-][\s]*\d{4}$/)
  if (shortFormatMatch) {
    return shortFormatMatch[1]
  }

  return null
}

/**
 * Wyciąga część datową z numeru faktury (MM/YYYY)
 * Przykłady:
 * - "37/12/2025" → "12/2025"
 * - "7/12/2025" → "12/2025"
 * - "PS 123/11/2025" → "11/2025"
 */
export function extractDatePart(invoiceNumber: string): string | null {
  if (!invoiceNumber) return null

  // Format: NN/MM/YYYY - wyciągnij MM/YYYY
  const match = invoiceNumber.match(/\d{1,5}[\s]*[\/\\_.\-][\s]*(\d{1,2})[\s]*[\/\\_.\-][\s]*(\d{4})/)
  if (match) {
    return `${match[1]}/${match[2]}`
  }

  return null
}

/**
 * Normalize invoice number for flexible matching
 * Handles variations like:
 * - PS 23/12/2025 vs PS 23_12_2025 (different separators)
 * - PS 52/01/2026 vs PS 52 /01/2026 (extra spaces)
 * - PS 195/12/2025 vs PS195 /12/2025 (missing/extra spaces)
 * - INV/27/12/2025 vs PS 27/12/2025 (INV prefix instead of PS)
 * - INV/PS 6 9/11/2025 vs PS 69/11/2025 (spaces between digits)
 */
export function normalizeInvoiceNumber(invoiceNumber: string): string {
  return invoiceNumber
    .toUpperCase()
    .replace(/[\s_.\-\/\\]+/g, '') // Remove all separators and spaces
    .trim()
}

/**
 * Normalize invoice number with PADDED sequence number to fixed length
 * This prevents false positives where "37122025" contains "7122025" as substring
 *
 * Format: SSSSS + MM + YYYY = 11 characters
 * - SSSSS = sequence number padded to 5 digits (e.g., 7 → 00007, 37 → 00037)
 * - MM = month padded to 2 digits
 * - YYYY = year (4 digits)
 *
 * Examples:
 * - "37/12/2025" → "0003712" + "2025" = "00037122025"
 * - "7/12/2025" → "0000712" + "2025" = "00007122025"
 * - "2347/12/2025" → "0234712" + "2025" = "02347122025"
 *
 * Now "00037122025".includes("00007122025") = FALSE ✓
 */
export function normalizeInvoiceNumberPadded(invoiceNumber: string): string | null {
  const seq = extractSequenceNumber(invoiceNumber)
  const datePart = extractDatePart(invoiceNumber)

  if (!seq || !datePart) {
    return null // Not a standard format, can't normalize
  }

  // Parse date part (MM/YYYY)
  const dateMatch = datePart.match(/^(\d{1,2})\/(\d{4})$/)
  if (!dateMatch) {
    return null
  }

  const month = dateMatch[1].padStart(2, '0')
  const year = dateMatch[2]
  const paddedSeq = seq.padStart(5, '0')

  return `${paddedSeq}${month}${year}`
}

/**
 * Extract just the numeric pattern from invoice number (ignores all prefixes)
 * Examples:
 * - "PS 27/12/2025" -> "27122025"
 * - "INV/27/12/2025" -> "27122025"
 * - "INV/PS 6 9/11/2025" -> "69112025"
 * - "/ 212/12/ 2025" -> "212122025"
 */
export function extractInvoiceDigitsOnly(text: string): string {
  // Remove all non-digit characters
  return text.replace(/\D/g, '')
}

/**
 * Strip common prefixes from invoice number for matching
 * Removes: INV, PS, FV, FA, FAK, FAKT, FAKTURA and separators
 */
export function stripInvoicePrefixes(text: string): string {
  return text
    .toUpperCase()
    .replace(/^(INV|INVOICE|FAKTURA|FAKT|FAK|FV|FA|PS|F)[\s\-\/\\_.:;,]*/gi, '')
    .replace(/[\s_.\-\/\\]+/g, '') // Remove remaining separators
    .trim()
}

/**
 * Create regex pattern for flexible invoice number matching
 * Allows for variations in separators (/, _, ., -, space) and extra spaces
 */
export function createInvoiceNumberPattern(invoiceNumber: string): RegExp {
  // Escape special regex chars, but we'll replace separators with flexible patterns
  const escaped = invoiceNumber
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  // Replace separators and spaces with flexible pattern that matches any separator or space
  // This handles: PS 23/12/2025 matching PS 23_12_2025, PS 23 /12/2025, PS23/12/2025, etc.
  const flexiblePattern = escaped
    .replace(/[\s\/\\_.\-]+/g, '[\\s\\/\\\\_\\.\\-]*') // Any combination of separators

  return new RegExp(flexiblePattern, 'i')
}

/**
 * Check if invoice number matches text with flexible matching
 * Returns match score (0-1) based on how close the match is
 *
 * Handles cases like:
 * - PS 27/12/2025 vs INV/27/12/2025 (different prefix)
 * - PS 212/12/2025 vs INV/212 /12/2025 (random spaces)
 * - PS 69/11/2025 vs INV/PS 6 9/11/2025 (spaces between digits)
 * - PS 27/12/2025 vs / 27/12/ 2025 (no prefix, random spaces)
 */
export function matchInvoiceNumberFlexible(invoiceNumber: string, text: string): number {
  // DEBUG: Log inputs for problematic cases
  const isDebugCase = invoiceNumber.includes('37') && text.includes('7/12')
  if (isDebugCase) {
    console.log(`🔍 DEBUG matchInvoiceNumberFlexible:`)
    console.log(`   invoiceNumber: "${invoiceNumber}"`)
    console.log(`   text: "${text}"`)
  }

  // KROK 0: Użyj PADOWANEJ normalizacji dla formatów z datą (NN/MM/YYYY)
  // To zapobiega fałszywym pozytywom gdzie "37122025" zawiera "7122025"
  const paddedInvoice = normalizeInvoiceNumberPadded(invoiceNumber)
  const paddedText = normalizeInvoiceNumberPadded(text)

  if (isDebugCase) {
    console.log(`   paddedInvoice: "${paddedInvoice}"`)
    console.log(`   paddedText: "${paddedText}"`)
  }

  // Jeśli oba mają format daty, porównaj PADOWANE wersje
  if (paddedInvoice && paddedText) {
    if (paddedInvoice === paddedText) {
      if (isDebugCase) console.log(`   ✓ EXACT PADDED MATCH! returning 1.0`)
      return 1.0
    }
    // Różne numery w tym samym formacie = NIE PASUJĄ
    if (isDebugCase) console.log(`   ✗ REJECT: Padded numbers differ: "${paddedInvoice}" vs "${paddedText}", returning 0`)
    return 0
  }

  // Normalize both for comparison (removes separators but keeps prefixes)
  const normalizedInvoice = normalizeInvoiceNumber(invoiceNumber)
  const normalizedText = normalizeInvoiceNumber(text)

  if (isDebugCase) {
    console.log(`   normalizedInvoice: "${normalizedInvoice}"`)
    console.log(`   normalizedText: "${normalizedText}"`)
  }

  // UWAGA: Nie używamy includes() dla porównań bo prowadzi do fałszywych pozytywów!
  // "37122025".includes("7122025") = TRUE (błąd!)
  // Zamiast tego używamy DOKŁADNEGO porównania lub startsWith

  // Perfect match after normalization (EXACT match only)
  if (normalizedText === normalizedInvoice) {
    if (isDebugCase) console.log(`   ✓ EXACT normalized match, returning 1.0`)
    return 1.0
  }

  // Try with stripped prefixes (handles INV/ vs PS cases)
  const strippedInvoice = stripInvoicePrefixes(invoiceNumber)
  const strippedText = stripInvoicePrefixes(text)

  if (isDebugCase) {
    console.log(`   strippedInvoice: "${strippedInvoice}"`)
    console.log(`   strippedText: "${strippedText}"`)
  }

  // EXACT match after stripping prefixes
  if (strippedText === strippedInvoice) {
    if (isDebugCase) console.log(`   ✓ EXACT stripped match, returning 0.98`)
    return 0.98 // Very close - only prefix differs
  }

  // Extract just digits for comparison (handles "6 9" -> "69" case)
  const invoiceDigits = extractInvoiceDigitsOnly(invoiceNumber)
  const textDigits = extractInvoiceDigitsOnly(text)

  if (isDebugCase) {
    console.log(`   invoiceDigits: "${invoiceDigits}"`)
    console.log(`   textDigits: "${textDigits}"`)
  }

  // For invoice numbers, we need at least some digits
  if (invoiceDigits.length < 3) {
    if (isDebugCase) console.log(`   ✗ invoiceDigits.length < 3, returning 0`)
    return 0
  }

  // EXACT digit match only (nie includes!)
  if (textDigits === invoiceDigits) {
    // Full digit sequence match - very reliable
    // Check if any known prefix exists in text
    const hasKnownPrefix = /\b(INV|PS|FV|FA|FAK|FAKT|FAKTURA)\b/i.test(text)
    if (isDebugCase) console.log(`   ✓ EXACT digits match, hasKnownPrefix=${hasKnownPrefix}`)
    if (hasKnownPrefix) {
      return 0.95 // Has invoice-like prefix + exact digits
    }
    return 0.85 // Just digits match (no prefix but good match)
  }

  // Try flexible pattern matching on original text
  const pattern = createInvoiceNumberPattern(invoiceNumber)
  const patternMatches = pattern.test(text)
  if (isDebugCase) {
    console.log(`   pattern: ${pattern}`)
    console.log(`   patternMatches: ${patternMatches}`)
  }
  if (patternMatches) {
    if (isDebugCase) console.log(`   ✓ MATCH: pattern.test(text) = true, returning 0.9`)
    return 0.9 // Pattern match with possible separator differences
  }

  // Last resort: porównaj numery sekwencyjne I daty dla formatów typu NN/MM/YYYY
  // Przykłady błędów które to naprawia:
  // - 37/12/2025 vs 7/12/2025 (różne sekwencje: 37 vs 7)
  // - 13/01/2026 vs 13/12/2025 (różne daty: 01/2026 vs 12/2025)
  if (invoiceDigits.length >= 4) {
    const invoiceSeq = extractSequenceNumber(invoiceNumber)
    const textSeq = extractSequenceNumber(text)
    const invoiceDatePart = extractDatePart(invoiceNumber)
    const textDatePart = extractDatePart(text)

    if (isDebugCase) {
      console.log(`   invoiceSeq: "${invoiceSeq}"`)
      console.log(`   textSeq: "${textSeq}"`)
      console.log(`   invoiceDatePart: "${invoiceDatePart}"`)
      console.log(`   textDatePart: "${textDatePart}"`)
    }

    // Jeśli oba mają numer sekwencyjny I datę, OBIE części muszą się zgadzać
    if (invoiceSeq && textSeq && invoiceDatePart && textDatePart) {
      if (invoiceSeq === textSeq && invoiceDatePart === textDatePart) {
        if (isDebugCase) console.log(`   ✓ MATCH: seq and date match, returning 0.8`)
        return 0.8  // Pełne dopasowanie sekwencji i daty
      }
      // Różna sekwencja LUB różna data = inna faktura!
      if (isDebugCase) console.log(`   ✗ REJECT: invoiceSeq "${invoiceSeq}" !== textSeq "${textSeq}" OR dates differ, returning 0`)
      return 0
    }

    // Jeśli tylko sekwencje (bez pełnych dat)
    if (invoiceSeq && textSeq) {
      if (invoiceSeq !== textSeq) {
        if (isDebugCase) console.log(`   ✗ REJECT: sequences differ without full dates, returning 0`)
        return 0  // Różne numery sekwencyjne = nie dopasowanie
      }
      // Ta sama sekwencja, ale brak pełnych dat - słabszy match
      if (isDebugCase) console.log(`   Same sequence, no full dates, returning 0.5`)
      return 0.5
    }

    // Fallback dla formatów bez wyraźnego numeru sekwencyjnego
    const invoiceNumberPart = invoiceDigits.slice(0, -6) // Remove date part
    if (invoiceNumberPart.length >= 1 && textDigits.startsWith(invoiceNumberPart)) {
      if (isDebugCase) console.log(`   Prefix match fallback, returning 0.4`)
      return 0.4  // Niższy score dla prefix match
    }
  }

  if (isDebugCase) console.log(`   No match found, returning 0`)
  return 0
}

/**
 * Extract multiple invoice numbers from text (handles lists separated by ; or ,)
 * Examples:
 * - "fv PS68/12/2025; PS 42/01/2026" -> ["PS68/12/2025", "PS 42/01/2026"]
 * - "PS 1/01/2026, PS 2/01/2026" -> ["PS 1/01/2026", "PS 2/01/2026"]
 * - "INV/27/12/2025" -> ["INV/27/12/2025"]
 * - "INV/PS 6 9/11/2025" -> ["INV/PS 6 9/11/2025"]
 */
export function extractMultipleInvoiceNumbers(text: string): string[] {
  const results: string[] = []

  // Common invoice number patterns with prefix
  // PS 123/12/2025, FV/2024/001, FAK-2024-001, INV/27/12/2025, etc.
  const patterns = [
    // INV format with optional PS: INV/27/12/2025, INV/PS 69/11/2025, INV/PS 6 9/11/2025
    /\bINV[\s\/\\_.\-]*(PS[\s]*)?[\d\s]{1,6}[\s]*[\/\\_.\-][\s]*\d{1,2}[\s]*[\/\\_.\-][\s]*\d{2,4}\b/gi,
    // PS format: PS 123/12/2025, PS123/12/2025, PS 123_12_2025, PS 6 9/11/2025
    /\b(PS|FV|FAK|FA|F|FAKT|FAKTURA)[\s]*[\d\s]{1,6}[\s]*[\/\\_.\-][\s]*\d{1,2}[\s]*[\/\\_.\-][\s]*\d{2,4}\b/gi,
    // Standard formats: FV/2024/001, FV-2024-001
    /\b(FV|FAK|FA|F|FAKT|FAKTURA)[\/\\_.\-]?\d{2,4}[\/\\_.\-]\d{1,5}\b/gi,
    // Just numbers with date pattern: 27/12/2025, 212/12/2025 (3 parts)
    /(?:^|[^\d])(\d{1,5}[\s]*[\/\\_.\-][\s]*\d{1,2}[\s]*[\/\\_.\-][\s]*\d{2,4})(?:[^\d]|$)/g,
    // Two part: 001/2024, 001/24
    /\b\d{1,5}[\/\\_.\-]\d{2,4}\b/g,
  ]

  for (const pattern of patterns) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(text)) !== null) {
      // Use captured group if exists, otherwise full match
      const result = match[1] || match[0]
      results.push(result.trim())
    }
  }

  // Remove duplicates (normalize for comparison, keep original format)
  const seen = new Set<string>()
  const unique: string[] = []

  for (const result of results) {
    // Use digits-only for deduplication (handles "6 9" vs "69")
    const normalized = extractInvoiceDigitsOnly(result)
    if (normalized.length >= 3 && !seen.has(normalized)) {
      seen.add(normalized)
      unique.push(result)
    }
  }

  return unique
}

/**
 * Extract invoice numbers from text using common patterns
 * Patterns: FV/2024/001, FV-2024-001, F/001/2024, 001/2024, etc.
 */
export function extractInvoiceNumbers(text: string): string[] {
  return extractMultipleInvoiceNumbers(text)
}

/**
 * Extract NIP from ID IPH format: "ID IPH: XX00XXXXXXXXXX"
 * The last 10 digits after the XX00 prefix represent the NIP
 * Examples:
 * - "ID IPH: XX005832141328" -> "5832141328"
 * - "ID IPH: XX009512412845" -> "9512412845"
 */
export function extractNIPFromIdIPH(text: string): string | null {
  if (!text) return null

  // Match ID IPH pattern: ID IPH: followed by letters/digits
  const idIphMatch = text.match(/ID\s*IPH:\s*([A-Z0-9]+)/i)
  if (!idIphMatch) return null

  const idIph = idIphMatch[1]
  // Extract digits only
  const digits = idIph.replace(/\D/g, '')

  // ID IPH format: XX00 + 10-digit NIP = 14 characters (2 letters + 12 digits)
  // The last 10 digits are the NIP
  if (digits.length >= 10) {
    return digits.slice(-10)
  }

  return null
}

/**
 * Extract NIP (Polish tax ID) from text
 * NIP format: 10 digits, sometimes with dashes: 123-456-78-90 or 123-45-67-890
 */
export function extractNIP(text: string): string | null {
  // Remove common prefixes
  const cleaned = text.replace(/NIP[:\s]*/gi, '')

  // Pattern for NIP with optional dashes/spaces
  const nipPattern = /\b(\d{3}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}|\d{3}[\s-]?\d{2}[\s-]?\d{2}[\s-]?\d{3}|\d{10})\b/g

  const matches = cleaned.match(nipPattern)

  if (matches) {
    for (const match of matches) {
      const digits = match.replace(/[\s-]/g, '')
      if (digits.length === 10) {
        return digits
      }
    }
  }

  return null
}

/**
 * Normalize NIP to 10 digits
 */
export function normalizeNIP(nip: string | null | undefined): string | null {
  if (!nip) return null
  const digits = nip.replace(/[\s-]/g, '')
  return digits.length === 10 ? digits : null
}

/**
 * Compare company names with fuzzy matching
 * Handles common variations: Sp. z o.o., S.A., etc.
 */
export function compareCompanyNames(name1: string, name2: string): number {
  // Remove common legal suffixes for comparison
  const suffixes = [
    'sp z o o',
    'sp zoo',
    'spzoo',
    'spolka z o o',
    'spolka z ograniczona odpowiedzialnoscia',
    's a',
    'sa',
    'spolka akcyjna',
    'sp j',
    'spolka jawna',
    'sp k',
    'spolka komandytowa',
    'sp p',
    'spolka partnerska',
  ]

  let normalized1 = normalizeString(name1)
  let normalized2 = normalizeString(name2)

  for (const suffix of suffixes) {
    normalized1 = normalized1.replace(new RegExp(`\\b${suffix}\\b`, 'g'), '').trim()
    normalized2 = normalized2.replace(new RegExp(`\\b${suffix}\\b`, 'g'), '').trim()
  }

  // Also remove punctuation
  normalized1 = normalized1.replace(/[.,-]/g, ' ').replace(/\s+/g, ' ').trim()
  normalized2 = normalized2.replace(/[.,-]/g, ' ').replace(/\s+/g, ' ').trim()

  // Check for exact match after normalization
  if (normalized1 === normalized2) return 1

  // Check if one contains the other (for partial matches)
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
    return 0.9
  }

  // Split into words and check word-by-word matching (handles reversed name order)
  const words1 = normalized1.split(' ').filter(w => w.length > 1)
  const words2 = normalized2.split(' ').filter(w => w.length > 1)

  if (words1.length > 0 && words2.length > 0) {
    // Check how many words match (regardless of order)
    let matchedWords = 0
    const usedWords2 = new Set<number>()

    for (const word1 of words1) {
      for (let i = 0; i < words2.length; i++) {
        if (usedWords2.has(i)) continue
        const word2 = words2[i]
        // Exact word match or very similar (for typos)
        if (word1 === word2 || stringSimilarity(word1, word2) >= 0.85) {
          matchedWords++
          usedWords2.add(i)
          break
        }
      }
    }

    const totalWords = Math.max(words1.length, words2.length)
    const wordMatchRatio = matchedWords / totalWords

    // If most words match (regardless of order), it's a good match
    // Example: "JANOWSKI TOMASZ" vs "Tomasz Janowski" -> 2/2 = 1.0
    if (wordMatchRatio >= 0.8) {
      return 0.85 + wordMatchRatio * 0.1 // 0.85-0.95 range
    }

    // If at least half the words match
    if (wordMatchRatio >= 0.5) {
      return 0.6 + wordMatchRatio * 0.2 // 0.7-0.8 range
    }
  }

  // Use string similarity
  return stringSimilarity(normalized1, normalized2)
}
