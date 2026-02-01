import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

interface PendingCheckout {
  priceId: string
  planId: string
  createdAt: number
}

// 24 hours expiry for pending checkout
const PENDING_CHECKOUT_EXPIRY = 24 * 60 * 60 * 1000

export function usePendingCheckout() {
  const { user, loading: authLoading } = useAuth()
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    // Wait for auth to be ready
    if (authLoading || !user) return

    const processPendingCheckout = async () => {
      const stored = localStorage.getItem('pendingCheckout')
      if (!stored) return

      try {
        const pending: PendingCheckout = JSON.parse(stored)

        // Check if expired (24 hours)
        if (Date.now() - pending.createdAt > PENDING_CHECKOUT_EXPIRY) {
          localStorage.removeItem('pendingCheckout')
          return
        }

        setProcessing(true)
        toast.info('Przekierowujemy do płatności...')

        // Create checkout session
        const { data, error } = await supabase.functions.invoke('create-checkout-session', {
          body: {
            priceId: pending.priceId,
            successUrl: `${window.location.origin}/settings/billing?checkout=success`,
            cancelUrl: `${window.location.origin}/settings/billing?checkout=canceled`,
          },
        })

        // Clear pending checkout regardless of result
        localStorage.removeItem('pendingCheckout')

        if (error || !data?.url) {
          console.error('Checkout error:', error)
          toast.error('Nie udało się utworzyć sesji płatności. Spróbuj w ustawieniach.')
          setProcessing(false)
          return
        }

        // Redirect to Stripe Checkout
        window.location.href = data.url
      } catch (err) {
        console.error('Error processing pending checkout:', err)
        localStorage.removeItem('pendingCheckout')
        setProcessing(false)
      }
    }

    processPendingCheckout()
  }, [user, authLoading])

  return { processing }
}
