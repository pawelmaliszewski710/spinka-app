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
 * Extract invoice numbers from text using common patterns
 * Patterns: FV/2024/001, FV-2024-001, F/001/2024, 001/2024, etc.
 */
export function extractInvoiceNumbers(text: string): string[] {
  const patterns = [
    // FV/2024/001, FV-2024-001, FAK/2024/001
    /\b(FV|FAK|FA|F|FAKT|FAKTURA)[/-]?\d{2,4}[/-]\d{1,5}\b/gi,
    // 001/2024, 001/24
    /\b\d{1,5}[/-]\d{2,4}\b/g,
    // FV2024001, FV24001
    /\b(FV|FAK|FA|F)\d{6,10}\b/gi,
    // Just FV followed by numbers
    /\b(FV|FAK|FA)\s*\d{1,10}\b/gi,
  ]

  const results: string[] = []

  for (const pattern of patterns) {
    const matches = text.match(pattern)
    if (matches) {
      results.push(...matches.map((m) => m.toUpperCase().replace(/\s+/g, '')))
    }
  }

  // Remove duplicates and return
  return [...new Set(results)]
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

  // Use string similarity
  return stringSimilarity(normalized1, normalized2)
}
