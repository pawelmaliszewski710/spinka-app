import { test, expect } from '@playwright/test'

test.describe('App', () => {
  test('should load the application', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/InvoiceMatch/i)
  })

  test('should show login page for unauthenticated users', async ({ page }) => {
    await page.goto('/')
    // App should redirect to login for unauthenticated users
    await expect(page.getByText('InvoiceMatch')).toBeVisible()
    await expect(page.getByText(/zaloguj się do swojego konta/i)).toBeVisible()
  })

  test('should have functional login form', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/hasło/i)).toBeVisible()
  })
})
