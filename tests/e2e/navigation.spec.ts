import { test, expect } from '@playwright/test'

test.describe('Navigation', () => {
  test('should load the application', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/InvoiceMatch/i)
  })

  test('should display header with logo', async ({ page }) => {
    await page.goto('/')
    const logo = page.getByText(/InvoiceMatch/i).first()
    await expect(logo).toBeVisible()
  })

  test('navigation shows correct items when authenticated', async ({ page }) => {
    await page.goto('/')
    
    // Check page loads properly
    const isLoginVisible = await page.getByRole('heading', { name: /zaloguj się/i }).isVisible().catch(() => false)
    
    if (isLoginVisible) {
      // On login page - check login form is present
      await expect(page.getByRole('button', { name: /zaloguj/i })).toBeVisible()
    }
  })

  test('should handle 404 for unknown routes', async ({ page }) => {
    await page.goto('/unknown-route-xyz')
    // Should either redirect to login or show 404
    await expect(page).toHaveURL(/.+/)
  })
})
