import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'

// Map Stripe price IDs to plan IDs
// These should match your Stripe products
const PRICE_TO_PLAN: Record<string, string> = {
  // Add your actual Stripe price IDs here
  // Monthly plans
  [Deno.env.get('STRIPE_PRICE_STANDARD_MONTHLY') || 'price_standard_monthly']: 'standard',
  [Deno.env.get('STRIPE_PRICE_MULTI_MONTHLY') || 'price_multi_monthly']: 'multi',
  [Deno.env.get('STRIPE_PRICE_ENTERPRISE_MONTHLY') || 'price_enterprise_monthly']: 'enterprise',
  // Yearly plans
  [Deno.env.get('STRIPE_PRICE_STANDARD_YEARLY') || 'price_standard_yearly']: 'standard',
  [Deno.env.get('STRIPE_PRICE_MULTI_YEARLY') || 'price_multi_yearly']: 'multi',
  [Deno.env.get('STRIPE_PRICE_ENTERPRISE_YEARLY') || 'price_enterprise_yearly']: 'enterprise',
}

Deno.serve(async (req: Request) => {
  try {
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')

    if (!stripeSecretKey || !webhookSecret) {
      console.error('Missing Stripe configuration')
      return new Response('Stripe not configured', { status: 500 })
    }

    // Get signature from header
    const signature = req.headers.get('stripe-signature')
    if (!signature) {
      console.error('Missing stripe-signature header')
      return new Response('Missing signature', { status: 400 })
    }

    // Get raw body
    const body = await req.text()

    // Initialize Stripe
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })

    // Verify webhook signature
    let event: Stripe.Event
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret
      )
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message)
      return new Response(`Webhook Error: ${err.message}`, { status: 400 })
    }

    console.log(`Received Stripe event: ${event.type}`)

    // Initialize Supabase with service role (bypass RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Log event to subscription_events table
    await supabase.from('subscription_events').insert({
      event_type: event.type,
      stripe_event_id: event.id,
      payload: event.data.object,
    })

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.supabase_user_id
        const subscriptionId = session.subscription as string

        if (!userId || !subscriptionId) {
          console.error('Missing user_id or subscription_id in session metadata')
          break
        }

        console.log(`Checkout completed for user ${userId}, subscription ${subscriptionId}`)

        // Get subscription details
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        const priceId = subscription.items.data[0]?.price.id

        // Determine plan from price ID
        let planId = PRICE_TO_PLAN[priceId] || 'standard'

        // If not found in map, try to find from plan_limits table
        if (!PRICE_TO_PLAN[priceId]) {
          const { data: planData } = await supabase
            .from('plan_limits')
            .select('plan_id')
            .or(`stripe_price_id_monthly.eq.${priceId},stripe_price_id_yearly.eq.${priceId}`)
            .single()

          if (planData) {
            planId = planData.plan_id
          }
        }

        console.log(`Activating plan ${planId} for user ${userId}`)

        // Update user profile
        await supabase.from('user_profiles').upsert({
          id: userId,
          plan_id: planId,
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: subscriptionId,
          subscription_status: 'active',
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'id',
        })

        // Update subscription_events with user_id
        await supabase.from('subscription_events')
          .update({ user_id: userId })
          .eq('stripe_event_id', event.id)

        // Create initial usage tracking record for current period
        const periodStart = new Date(subscription.current_period_start * 1000)
        const periodEnd = new Date(subscription.current_period_end * 1000)

        await supabase.from('usage_tracking').upsert({
          user_id: userId,
          period_start: periodStart.toISOString().split('T')[0],
          period_end: periodEnd.toISOString().split('T')[0],
          invoices_imported: 0,
          ai_tokens_used: 0,
          ai_cost_cents: 0,
        }, {
          onConflict: 'user_id,period_start',
        })

        console.log(`Successfully activated subscription for user ${userId}`)
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        // Find user by customer ID
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single()

        if (!profile) {
          console.error(`No user found for customer ${customerId}`)
          break
        }

        console.log(`Subscription updated for user ${profile.id}`)

        // Map subscription status
        let status: string
        switch (subscription.status) {
          case 'active':
          case 'trialing':
            status = subscription.status
            break
          case 'canceled':
          case 'unpaid':
          case 'incomplete_expired':
            status = 'canceled'
            break
          case 'past_due':
          case 'incomplete':
            status = 'past_due'
            break
          default:
            status = 'active'
        }

        // Get current plan from price
        const priceId = subscription.items.data[0]?.price.id
        let planId = PRICE_TO_PLAN[priceId]

        if (!planId) {
          const { data: planData } = await supabase
            .from('plan_limits')
            .select('plan_id')
            .or(`stripe_price_id_monthly.eq.${priceId},stripe_price_id_yearly.eq.${priceId}`)
            .single()

          planId = planData?.plan_id || 'standard'
        }

        // Update profile
        await supabase.from('user_profiles').update({
          plan_id: status === 'canceled' ? 'free' : planId,
          subscription_status: status,
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', profile.id)

        // Update event with user_id
        await supabase.from('subscription_events')
          .update({ user_id: profile.id })
          .eq('stripe_event_id', event.id)

        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        // Find user by customer ID
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single()

        if (!profile) {
          console.error(`No user found for customer ${customerId}`)
          break
        }

        console.log(`Subscription deleted for user ${profile.id}, reverting to free plan`)

        // Revert to free plan
        await supabase.from('user_profiles').update({
          plan_id: 'free',
          subscription_status: 'canceled',
          stripe_subscription_id: null,
          updated_at: new Date().toISOString(),
        }).eq('id', profile.id)

        // Update event with user_id
        await supabase.from('subscription_events')
          .update({ user_id: profile.id })
          .eq('stripe_event_id', event.id)

        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string

        // Find user by customer ID
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single()

        if (!profile) {
          console.error(`No user found for customer ${customerId}`)
          break
        }

        console.log(`Payment failed for user ${profile.id}`)

        // Mark subscription as past_due
        await supabase.from('user_profiles').update({
          subscription_status: 'past_due',
          updated_at: new Date().toISOString(),
        }).eq('id', profile.id)

        // Update event with user_id
        await supabase.from('subscription_events')
          .update({ user_id: profile.id })
          .eq('stripe_event_id', event.id)

        break
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string

        // Find user by customer ID
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single()

        if (!profile) {
          break
        }

        console.log(`Invoice paid for user ${profile.id}`)

        // Ensure subscription is active
        await supabase.from('user_profiles').update({
          subscription_status: 'active',
          updated_at: new Date().toISOString(),
        }).eq('id', profile.id)

        // Update or create usage tracking for new billing period
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string)

          const periodStart = new Date(subscription.current_period_start * 1000)
          const periodEnd = new Date(subscription.current_period_end * 1000)

          await supabase.from('usage_tracking').upsert({
            user_id: profile.id,
            period_start: periodStart.toISOString().split('T')[0],
            period_end: periodEnd.toISOString().split('T')[0],
            invoices_imported: 0,
            ai_tokens_used: 0,
            ai_cost_cents: 0,
          }, {
            onConflict: 'user_id,period_start',
          })
        }

        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Webhook error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
