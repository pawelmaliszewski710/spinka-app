import { test, expect } from '@playwright/test'

test.describe('Invoices Page', () => {
  test('should redirect to login when not authenticated', async ({ page }) => {
    await page.goto('/invoices')
    
    // Should redirect to login
    await expect(page.getByText('InvoiceMatch')).toBeVisible()
  })
})

test.describe('Payments Page', () => {
  test('should redirect to login when not authenticated', async ({ page }) => {
    await page.goto('/payments')
    
    // Should redirect to login
    await expect(page.getByText('InvoiceMatch')).toBeVisible()
  })
})

test.describe('Matching Page', () => {
  test('should redirect to login when not authenticated', async ({ page }) => {
    await page.goto('/matching')
    
    // Should redirect to login
    await expect(page.getByText('InvoiceMatch')).toBeVisible()
  })
})

test.describe('Overdue Page', () => {
  test('should redirect to login when not authenticated', async ({ page }) => {
    await page.goto('/overdue')
    
    // Should redirect to login
    await expect(page.getByText('InvoiceMatch')).toBeVisible()
  })
})
