import { describe, it, expect } from 'vitest'
import { formatCurrency, formatDate, normalizeNip, normalizeInvoiceNumber } from '@/lib/utils'

describe('utils', () => {
  describe('formatCurrency', () => {
    it('should format PLN currency correctly', () => {
      const result = formatCurrency(1234.56)
      expect(result).toContain('1')
      expect(result).toContain('234')
      expect(result).toContain('56')
    })

    it('should handle zero', () => {
      const result = formatCurrency(0)
      expect(result).toContain('0')
    })
  })

  describe('formatDate', () => {
    it('should format date in short format', () => {
      const result = formatDate('2024-01-15', 'short')
      expect(result).toContain('2024')
    })

    it('should format date in long format', () => {
      const result = formatDate('2024-01-15', 'long')
      expect(result).toContain('2024')
    })
  })

  describe('normalizeNip', () => {
    it('should remove dashes and spaces from NIP', () => {
      expect(normalizeNip('123-456-78-90')).toBe('1234567890')
      expect(normalizeNip('123 456 78 90')).toBe('1234567890')
    })

    it('should return null for null input', () => {
      expect(normalizeNip(null)).toBeNull()
      expect(normalizeNip(undefined)).toBeNull()
    })
  })

  describe('normalizeInvoiceNumber', () => {
    it('should remove spaces and uppercase', () => {
      expect(normalizeInvoiceNumber('fv/2024/001')).toBe('FV/2024/001')
      expect(normalizeInvoiceNumber('FV 2024 001')).toBe('FV2024001')
    })
  })
})
