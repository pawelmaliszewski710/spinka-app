import { supabase } from '@/lib/supabase'

/**
 * Helper functions for tracking usage of invoices and AI tokens.
 * These are standalone functions (not hooks) that can be called from anywhere.
 */

/**
 * Get the current billing period dates
 */
function getCurrentPeriod(): { periodStart: string; periodEnd: string } {
  const today = new Date()
  const periodStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const periodEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)

  return {
    periodStart: periodStart.toISOString().split('T')[0],
    periodEnd: periodEnd.toISOString().split('T')[0],
  }
}

/**
 * Track invoice import usage
 * Call this after successfully importing invoices
 *
 * @param userId - The user's ID
 * @param count - Number of invoices imported
 */
export async function trackInvoiceImport(userId: string, count: number): Promise<void> {
  const { periodStart, periodEnd } = getCurrentPeriod()

  const { error } = await supabase.rpc('increment_invoice_usage', {
    p_user_id: userId,
    p_period_start: periodStart,
    p_period_end: periodEnd,
    p_count: count,
  })

  if (error) {
    console.error('Failed to track invoice import:', error)
    // Don't throw - tracking failure shouldn't block the import
  }
}

/**
 * Track AI usage (tokens and cost)
 * Call this after receiving an AI response
 *
 * @param userId - The user's ID
 * @param tokens - Total tokens used (input + output)
 * @param costCents - Cost in USD cents
 */
export async function trackAIUsage(
  userId: string,
  tokens: number,
  costCents: number
): Promise<void> {
  const { periodStart, periodEnd } = getCurrentPeriod()

  const { error } = await supabase.rpc('increment_ai_usage', {
    p_user_id: userId,
    p_period_start: periodStart,
    p_period_end: periodEnd,
    p_tokens: tokens,
    p_cost_cents: costCents,
  })

  if (error) {
    console.error('Failed to track AI usage:', error)
    // Don't throw - tracking failure shouldn't block the AI response
  }
}

/**
 * Calculate AI cost in cents based on model and tokens
 * Uses approximate pricing for common models
 *
 * @param model - Model identifier (e.g., 'anthropic/claude-sonnet-4')
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Cost in USD cents
 */
export function calculateAICost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  // Pricing per million tokens (in USD)
  const PRICING: Record<string, { input: number; output: number }> = {
    // Claude models
    'anthropic/claude-sonnet-4': { input: 3, output: 15 },
    'anthropic/claude-3.5-sonnet': { input: 3, output: 15 },
    'anthropic/claude-3-haiku': { input: 0.25, output: 1.25 },
    'anthropic/claude-3.5-haiku': { input: 1, output: 5 },
    // GPT models
    'openai/gpt-4o': { input: 2.5, output: 10 },
    'openai/gpt-4o-mini': { input: 0.15, output: 0.6 },
    // Default fallback
    default: { input: 3, output: 15 },
  }

  const pricing = PRICING[model] || PRICING.default

  // Calculate cost in USD
  const inputCost = (inputTokens / 1_000_000) * pricing.input
  const outputCost = (outputTokens / 1_000_000) * pricing.output
  const totalCost = inputCost + outputCost

  // Convert to cents and round up
  return Math.ceil(totalCost * 100)
}

/**
 * Check if user can import invoices (calls DB function)
 *
 * @param userId - The user's ID
 * @param count - Number of invoices to import (default 1)
 * @returns Promise<boolean> - Whether user can import
 */
export async function checkCanImportInvoices(
  userId: string,
  count = 1
): Promise<boolean> {
  const { data, error } = await supabase.rpc('can_import_invoices', {
    p_user_id: userId,
    p_count: count,
  })

  if (error) {
    console.error('Failed to check import limit:', error)
    return true // Allow on error (fail open)
  }

  return data === true
}

/**
 * Check if user can use AI (calls DB function)
 *
 * @param userId - The user's ID
 * @returns Promise<boolean> - Whether user can use AI
 */
export async function checkCanUseAI(userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('can_use_ai', {
    p_user_id: userId,
  })

  if (error) {
    console.error('Failed to check AI limit:', error)
    return false // Block AI on error (fail closed for paid feature)
  }

  return data === true
}

/**
 * Get user's current usage with limits
 *
 * @param userId - The user's ID
 * @returns Usage and limit data
 */
export async function getUserUsageWithLimits(userId: string): Promise<{
  planId: string
  displayName: string
  monthlyInvoiceLimit: number | null
  monthlyAiBudgetCents: number | null
  maxCompanies: number | null
  invoicesImported: number
  aiCostCents: number
  periodStart: string
  periodEnd: string
} | null> {
  const { data, error } = await supabase.rpc('get_user_usage_with_limits', {
    p_user_id: userId,
  })

  if (error) {
    console.error('Failed to get usage with limits:', error)
    return null
  }

  if (!data || data.length === 0) {
    return null
  }

  const row = data[0]
  return {
    planId: row.plan_id,
    displayName: row.display_name,
    monthlyInvoiceLimit: row.monthly_invoice_limit,
    monthlyAiBudgetCents: row.monthly_ai_budget_cents,
    maxCompanies: row.max_companies,
    invoicesImported: row.invoices_imported,
    aiCostCents: row.ai_cost_cents,
    periodStart: row.period_start,
    periodEnd: row.period_end,
  }
}
