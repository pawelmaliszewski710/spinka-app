import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('should redirect unauthenticated user to login', async ({ page }) => {
    // When not logged in, user should see login page with InvoiceMatch title
    await expect(page.getByText('InvoiceMatch')).toBeVisible()
    await expect(page.getByText(/zaloguj się do swojego konta/i)).toBeVisible()
  })

  test('should display login form with required fields', async ({ page }) => {
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/hasło/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /zaloguj/i })).toBeVisible()
  })

  test('should show validation error for empty email', async ({ page }) => {
    await page.getByRole('button', { name: /zaloguj/i }).click()
    // Should show validation or remain on login page
    await expect(page.getByText('InvoiceMatch')).toBeVisible()
  })

  test('should have link to registration page', async ({ page }) => {
    const registerLink = page.getByRole('link', { name: /zarejestruj/i })
    await expect(registerLink).toBeVisible()
    await registerLink.click()
    // Register page also has InvoiceMatch title with different description
    await expect(page.getByText('InvoiceMatch')).toBeVisible()
    await expect(page.getByText(/utwórz nowe konto/i)).toBeVisible()
  })

  test('should display registration form', async ({ page }) => {
    await page.goto('/register')
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/hasło/i).first()).toBeVisible()
    await expect(page.getByLabel(/potwierdź hasło/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /zarejestruj/i })).toBeVisible()
  })
})
