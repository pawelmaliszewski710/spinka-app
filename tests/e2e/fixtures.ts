/* eslint-disable react-hooks/rules-of-hooks */
import { test as base, expect } from '@playwright/test'

// Extend base test with custom fixtures
// Note: 'use' is a Playwright fixture function, not a React hook
export const test = base.extend<{
  authenticatedPage: ReturnType<typeof base['page']>
}>({
  authenticatedPage: async ({ page }, use) => {
    // In a real test environment, you would:
    // 1. Use a test account
    // 2. Set up storage state
    // 3. Or mock auth responses

    // For now, just pass through the page
    await use(page)
  },
})

export { expect }
