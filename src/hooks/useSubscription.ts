import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

// Plan limits interface
export interface PlanLimits {
  planId: string
  displayName: string
  monthlyInvoiceLimit: number | null
  monthlyAiBudgetCents: number | null
  maxCompanies: number | null
  features: Record<string, boolean>
}

// Usage data interface
export interface UsageData {
  invoicesImported: number
  aiTokensUsed: number
  aiCostCents: number
  periodStart: string
  periodEnd: string
}

// User profile with subscription
export interface UserProfile {
  planId: string
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  subscriptionStatus: 'active' | 'canceled' | 'past_due' | 'trialing'
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
}

interface SubscriptionState {
  plan: PlanLimits | null
  usage: UsageData | null
  profile: UserProfile | null
  loading: boolean
  error: Error | null
}

interface UseSubscriptionReturn extends SubscriptionState {
  // Check functions
  canImportInvoices: (count?: number) => boolean
  canUseAI: () => boolean
  canAddCompany: (currentCount: number) => boolean
  // Get remaining
  getRemainingInvoices: () => number | null
  getRemainingAiBudget: () => number | null
  // Actions
  createCheckoutSession: (priceId: string) => Promise<string>
  refreshSubscription: () => Promise<void>
  // Feature checks
  hasFeature: (featureName: string) => boolean
  isPaidPlan: () => boolean
}

// Default free plan limits
const DEFAULT_FREE_PLAN: PlanLimits = {
  planId: 'free',
  displayName: 'Darmowy',
  monthlyInvoiceLimit: 20,
  monthlyAiBudgetCents: 0,
  maxCompanies: 1,
  features: { ai_enabled: false },
}

export function useSubscription(): UseSubscriptionReturn {
  const { user } = useAuth()
  const [state, setState] = useState<SubscriptionState>({
    plan: null,
    usage: null,
    profile: null,
    loading: true,
    error: null,
  })

  // Load subscription data
  const loadSubscription = useCallback(async () => {
    if (!user) {
      setState({
        plan: DEFAULT_FREE_PLAN,
        usage: null,
        profile: null,
        loading: false,
        error: null,
      })
      return
    }

    try {
      setState((prev) => ({ ...prev, loading: true, error: null }))

      // Get user profile with plan limits
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select(`
          plan_id,
          stripe_customer_id,
          stripe_subscription_id,
          subscription_status,
          current_period_start,
          current_period_end,
          plan_limits (
            plan_id,
            display_name,
            monthly_invoice_limit,
            monthly_ai_budget_cents,
            max_companies,
            features
          )
        `)
        .eq('id', user.id)
        .single()

      // Handle case where profile doesn't exist (new user)
      if (profileError && profileError.code === 'PGRST116') {
        // No profile found - use default free plan
        setState({
          plan: DEFAULT_FREE_PLAN,
          usage: null,
          profile: {
            planId: 'free',
            stripeCustomerId: null,
            stripeSubscriptionId: null,
            subscriptionStatus: 'active',
            currentPeriodStart: null,
            currentPeriodEnd: null,
          },
          loading: false,
          error: null,
        })
        return
      }

      if (profileError) {
        throw profileError
      }

      // Parse plan limits
      const planLimits = profileData?.plan_limits as {
        plan_id: string
        display_name: string
        monthly_invoice_limit: number | null
        monthly_ai_budget_cents: number | null
        max_companies: number | null
        features: Record<string, boolean>
      } | null

      const plan: PlanLimits = planLimits
        ? {
            planId: planLimits.plan_id,
            displayName: planLimits.display_name,
            monthlyInvoiceLimit: planLimits.monthly_invoice_limit,
            monthlyAiBudgetCents: planLimits.monthly_ai_budget_cents,
            maxCompanies: planLimits.max_companies,
            features: planLimits.features || {},
          }
        : DEFAULT_FREE_PLAN

      const profile: UserProfile = {
        planId: profileData?.plan_id || 'free',
        stripeCustomerId: profileData?.stripe_customer_id || null,
        stripeSubscriptionId: profileData?.stripe_subscription_id || null,
        subscriptionStatus: profileData?.subscription_status || 'active',
        currentPeriodStart: profileData?.current_period_start || null,
        currentPeriodEnd: profileData?.current_period_end || null,
      }

      // Get current usage
      const today = new Date()
      const periodStart = new Date(today.getFullYear(), today.getMonth(), 1)
        .toISOString()
        .split('T')[0]

      const { data: usageData } = await supabase
        .from('usage_tracking')
        .select('*')
        .eq('user_id', user.id)
        .eq('period_start', periodStart)
        .single()

      const usage: UsageData | null = usageData
        ? {
            invoicesImported: usageData.invoices_imported || 0,
            aiTokensUsed: usageData.ai_tokens_used || 0,
            aiCostCents: usageData.ai_cost_cents || 0,
            periodStart: usageData.period_start,
            periodEnd: usageData.period_end,
          }
        : null

      setState({
        plan,
        usage,
        profile,
        loading: false,
        error: null,
      })
    } catch (error) {
      console.error('Error loading subscription:', error)
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error as Error,
      }))
    }
  }, [user])

  // Load on mount and when user changes
  useEffect(() => {
    loadSubscription()
  }, [loadSubscription])

  // Check if user can import invoices
  const canImportInvoices = useCallback(
    (count = 1): boolean => {
      const { plan, usage } = state
      if (!plan) return false

      // Unlimited
      if (plan.monthlyInvoiceLimit === null) return true

      const used = usage?.invoicesImported || 0
      return used + count <= plan.monthlyInvoiceLimit
    },
    [state]
  )

  // Check if user can use AI
  const canUseAI = useCallback((): boolean => {
    const { plan, usage } = state
    if (!plan) return false

    // Unlimited
    if (plan.monthlyAiBudgetCents === null) return true

    // No AI access
    if (plan.monthlyAiBudgetCents === 0) return false

    const used = usage?.aiCostCents || 0
    return used < plan.monthlyAiBudgetCents
  }, [state])

  // Check if user can add a company
  const canAddCompany = useCallback(
    (currentCount: number): boolean => {
      const { plan } = state
      if (!plan) return false

      // Unlimited
      if (plan.maxCompanies === null) return true

      return currentCount < plan.maxCompanies
    },
    [state]
  )

  // Get remaining invoices
  const getRemainingInvoices = useCallback((): number | null => {
    const { plan, usage } = state
    if (!plan || plan.monthlyInvoiceLimit === null) return null

    const used = usage?.invoicesImported || 0
    return Math.max(0, plan.monthlyInvoiceLimit - used)
  }, [state])

  // Get remaining AI budget
  const getRemainingAiBudget = useCallback((): number | null => {
    const { plan, usage } = state
    if (!plan || plan.monthlyAiBudgetCents === null) return null

    const used = usage?.aiCostCents || 0
    return Math.max(0, plan.monthlyAiBudgetCents - used)
  }, [state])

  // Check if user has a specific feature
  const hasFeature = useCallback(
    (featureName: string): boolean => {
      const { plan } = state
      if (!plan) return false

      return plan.features[featureName] === true
    },
    [state]
  )

  // Check if user is on a paid plan
  const isPaidPlan = useCallback((): boolean => {
    const { plan } = state
    if (!plan) return false

    return plan.planId !== 'free'
  }, [state])

  // Create Stripe checkout session
  const createCheckoutSession = useCallback(
    async (priceId: string): Promise<string> => {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          priceId,
          successUrl: `${window.location.origin}/settings/billing?checkout=success`,
          cancelUrl: `${window.location.origin}/settings/billing?checkout=canceled`,
        },
      })

      if (error) {
        console.error('Checkout error:', error)
        throw new Error(error.message || 'Nie udało się utworzyć sesji płatności')
      }

      if (!data?.url) {
        throw new Error('Brak URL sesji płatności')
      }

      return data.url
    },
    []
  )

  // Refresh subscription data
  const refreshSubscription = useCallback(async (): Promise<void> => {
    await loadSubscription()
  }, [loadSubscription])

  return {
    ...state,
    canImportInvoices,
    canUseAI,
    canAddCompany,
    getRemainingInvoices,
    getRemainingAiBudget,
    createCheckoutSession,
    refreshSubscription,
    hasFeature,
    isPaidPlan,
  }
}
