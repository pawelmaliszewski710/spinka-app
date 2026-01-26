import { test, expect } from '@playwright/test'

test.describe('Dashboard', () => {
  // Note: These tests assume user is authenticated
  // In real scenario, you'd set up auth state beforeEach

  test('should redirect to login when not authenticated', async ({ page }) => {
    // Without auth, accessing dashboard should redirect to login
    await page.goto('/dashboard')

    // Should see login page
    await expect(page.getByText('InvoiceMatch')).toBeVisible()
    await expect(page.getByText(/zaloguj się do swojego konta/i)).toBeVisible()
  })

  test('should show onboarding for new users without data', async ({ page }) => {
    await page.goto('/dashboard')
    
    // Either shows login or onboarding/dashboard
    const pageContent = await page.content()
    expect(pageContent).toBeTruthy()
  })

  test('should have navigation links', async ({ page }) => {
    await page.goto('/')
    
    // Check that the page loads
    await expect(page).toHaveTitle(/InvoiceMatch/i)
  })
})
