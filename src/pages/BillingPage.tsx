import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CreditCard, Check, Loader2, Crown, Building2, Briefcase, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageContainer } from '@/components/layout'
import { BlurFade } from '@/components/ui/blur-fade'
import { useSubscription } from '@/hooks/useSubscription'
import { UsageIndicator } from '@/components/subscription'
import { cn } from '@/lib/utils'

// Plan configuration
const PLANS = [
  {
    id: 'free',
    name: 'Darmowy',
    price: '0',
    period: '',
    description: 'Idealny do przetestowania systemu',
    icon: Zap,
    features: [
      '20 faktur miesięcznie',
      '1 firma',
      'Import z Fakturowni',
      'Import wyciągów bankowych',
      'Automatyczne dopasowanie',
    ],
    limitations: ['Bez AI'],
  },
  {
    id: 'standard',
    name: 'Standard',
    price: '99',
    period: '/mies.',
    description: 'Dla freelancerów i małych firm',
    icon: Briefcase,
    priceIdMonthly: import.meta.env.VITE_STRIPE_PRICE_STANDARD_MONTHLY,
    priceIdYearly: import.meta.env.VITE_STRIPE_PRICE_STANDARD_YEARLY,
    popular: true,
    features: [
      '100 faktur miesięcznie',
      '1 firma',
      'Import z Fakturowni',
      'Import wyciągów bankowych',
      'Automatyczne dopasowanie',
      'Asystent AI ($2/mies.)',
      'Priorytetowe wsparcie',
    ],
  },
  {
    id: 'multi',
    name: 'Multi-Firma',
    price: '199',
    period: '/mies.',
    description: 'Dla właścicieli kilku firm',
    icon: Building2,
    priceIdMonthly: import.meta.env.VITE_STRIPE_PRICE_MULTI_MONTHLY,
    priceIdYearly: import.meta.env.VITE_STRIPE_PRICE_MULTI_YEARLY,
    features: [
      'Bez limitu faktur',
      'Do 3 firm',
      'Import z Fakturowni',
      'Import wyciągów bankowych',
      'Automatyczne dopasowanie',
      'Asystent AI ($5/mies.)',
      'Priorytetowe wsparcie',
    ],
  },
  {
    id: 'enterprise',
    name: 'Biuro Rachunkowe',
    price: '499',
    period: '/mies.',
    description: 'Dla biur rachunkowych',
    icon: Crown,
    priceIdMonthly: import.meta.env.VITE_STRIPE_PRICE_ENTERPRISE_MONTHLY,
    priceIdYearly: import.meta.env.VITE_STRIPE_PRICE_ENTERPRISE_YEARLY,
    badge: 'Dla profesjonalistów',
    features: [
      'Bez limitu faktur',
      'Bez limitu firm',
      'Import z Fakturowni',
      'Import wyciągów bankowych',
      'Automatyczne dopasowanie',
      'Asystent AI bez limitu',
      'Dedykowany opiekun',
      'Własne integracje',
      'SLA 99.9%',
    ],
  },
]

export function BillingPage(): React.JSX.Element {
  const [searchParams] = useSearchParams()
  const { plan, profile, loading, createCheckoutSession, refreshSubscription } = useSubscription()
  const [upgrading, setUpgrading] = useState<string | null>(null)
  const [billingCycle] = useState<'monthly' | 'yearly'>('monthly')

  // Handle checkout result from URL params
  useEffect(() => {
    const checkoutResult = searchParams.get('checkout')
    if (checkoutResult === 'success') {
      toast.success('Subskrypcja aktywowana!', {
        description: 'Dziękujemy za zakup. Twój plan został aktywowany.',
      })
      refreshSubscription()
      // Clear URL params
      window.history.replaceState({}, '', window.location.pathname)
    } else if (checkoutResult === 'canceled') {
      toast.info('Płatność anulowana', {
        description: 'Możesz wrócić do wyboru planu w dowolnym momencie.',
      })
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [searchParams, refreshSubscription])

  const handleUpgrade = async (planConfig: (typeof PLANS)[0]): Promise<void> => {
    if (!planConfig.priceIdMonthly) {
      return
    }

    const priceId =
      billingCycle === 'yearly' ? planConfig.priceIdYearly : planConfig.priceIdMonthly

    if (!priceId) {
      toast.error('Konfiguracja cen niedostępna')
      return
    }

    try {
      setUpgrading(planConfig.id)
      const checkoutUrl = await createCheckoutSession(priceId)
      window.location.href = checkoutUrl
    } catch (error) {
      console.error('Checkout error:', error)
      toast.error('Błąd podczas tworzenia sesji płatności')
    } finally {
      setUpgrading(null)
    }
  }

  if (loading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PageContainer>
    )
  }

  const currentPlanId = plan?.planId || 'free'

  return (
    <PageContainer>
      <BlurFade delay={0.1}>
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <CreditCard className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Plan i rozliczenia</h1>
              <p className="text-muted-foreground">
                Zarządzaj swoją subskrypcją i zużyciem
              </p>
            </div>
          </div>
        </div>
      </BlurFade>

      {/* Current Plan & Usage */}
      <BlurFade delay={0.15}>
        <div className="grid gap-4 md:grid-cols-2 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Aktualny plan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  {(() => {
                    const Icon = PLANS.find((p) => p.id === currentPlanId)?.icon || Zap
                    return <Icon className="h-6 w-6 text-primary" />
                  })()}
                </div>
                <div>
                  <p className="text-xl font-bold">{plan?.displayName || 'Darmowy'}</p>
                  {profile?.subscriptionStatus && profile.subscriptionStatus !== 'active' && (
                    <Badge variant="destructive" className="mt-1">
                      {profile.subscriptionStatus === 'past_due'
                        ? 'Płatność zaległa'
                        : 'Anulowany'}
                    </Badge>
                  )}
                  {profile?.currentPeriodEnd && (
                    <p className="text-sm text-muted-foreground">
                      Odnowienie:{' '}
                      {new Date(profile.currentPeriodEnd).toLocaleDateString('pl-PL')}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Zużycie w tym miesiącu</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <UsageIndicator type="invoices" size="sm" showUpgrade={false} />
              <UsageIndicator type="ai" size="sm" showUpgrade={false} />
            </CardContent>
          </Card>
        </div>
      </BlurFade>

      {/* Plans Grid */}
      <BlurFade delay={0.2}>
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Dostępne plany</h2>
          <p className="text-sm text-muted-foreground">
            Wszystkie ceny są cenami netto. Wybierz plan dopasowany do Twoich potrzeb.
          </p>
        </div>
      </BlurFade>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((planConfig, index) => {
          const isCurrentPlan = currentPlanId === planConfig.id
          const Icon = planConfig.icon

          return (
            <BlurFade key={planConfig.id} delay={0.25 + index * 0.05}>
              <Card
                className={cn(
                  'relative h-full flex flex-col',
                  planConfig.popular && 'border-primary shadow-md',
                  isCurrentPlan && 'bg-primary/5'
                )}
              >
                {planConfig.popular && (
                  <Badge className="absolute -top-2 left-1/2 -translate-x-1/2">
                    Najpopularniejszy
                  </Badge>
                )}
                {planConfig.badge && !planConfig.popular && (
                  <Badge variant="secondary" className="absolute -top-2 left-1/2 -translate-x-1/2">
                    {planConfig.badge}
                  </Badge>
                )}

                <CardHeader className="pb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">{planConfig.name}</CardTitle>
                  </div>
                  <CardDescription>{planConfig.description}</CardDescription>
                  <div className="mt-2">
                    <span className="text-3xl font-bold">{planConfig.price} PLN</span>
                    <span className="text-muted-foreground">{planConfig.period}</span>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 flex flex-col">
                  <ul className="space-y-2 flex-1">
                    {planConfig.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                    {planConfig.limitations?.map((limitation) => (
                      <li key={limitation} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <span className="w-4 h-4 flex items-center justify-center mt-0.5 shrink-0">
                          —
                        </span>
                        <span>{limitation}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4 pt-4 border-t">
                    {isCurrentPlan ? (
                      <Button variant="outline" className="w-full" disabled>
                        Aktualny plan
                      </Button>
                    ) : planConfig.priceIdMonthly ? (
                      <Button
                        className="w-full"
                        variant={planConfig.popular ? 'default' : 'outline'}
                        onClick={() => handleUpgrade(planConfig)}
                        disabled={upgrading === planConfig.id}
                      >
                        {upgrading === planConfig.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          `Wybierz ${planConfig.name}`
                        )}
                      </Button>
                    ) : (
                      <Button variant="outline" className="w-full" disabled>
                        Plan bezpłatny
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </BlurFade>
          )
        })}
      </div>

      {/* FAQ or Contact */}
      <BlurFade delay={0.5}>
        <Card className="mt-8">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-muted-foreground">
                Masz pytania dotyczące planów lub potrzebujesz indywidualnej oferty?
              </p>
              <Button variant="link" asChild className="mt-2">
                <a href="mailto:kontakt@spinka.studio">Skontaktuj się z nami</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </BlurFade>
    </PageContainer>
  )
}

export default BillingPage
