import { Progress } from '@/components/ui/progress'
import { useSubscription } from '@/hooks/useSubscription'
import { cn } from '@/lib/utils'
import { FileText, Sparkles, AlertTriangle } from 'lucide-react'
import { Link } from 'react-router-dom'

interface UsageIndicatorProps {
  /** Type of usage to display */
  type: 'invoices' | 'ai'
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
  /** Show upgrade link when near limit */
  showUpgrade?: boolean
  /** Additional CSS classes */
  className?: string
}

/**
 * Displays usage progress for invoices or AI budget
 * Shows current usage vs limit with visual progress bar
 */
export function UsageIndicator({
  type,
  size = 'md',
  showUpgrade = true,
  className,
}: UsageIndicatorProps): React.JSX.Element | null {
  const { plan, usage, loading, getRemainingInvoices, getRemainingAiBudget } = useSubscription()

  if (loading || !plan) {
    return null
  }

  // For invoices
  if (type === 'invoices') {
    // Unlimited plan - don't show
    if (plan.monthlyInvoiceLimit === null) {
      return null
    }

    const used = usage?.invoicesImported || 0
    const limit = plan.monthlyInvoiceLimit
    const remaining = getRemainingInvoices() || 0
    const percentage = Math.min(100, (used / limit) * 100)
    const isNearLimit = remaining <= 5
    const isAtLimit = remaining === 0

    return (
      <UsageCard
        icon={<FileText className="h-4 w-4" />}
        label="Import faktur"
        used={used}
        limit={limit}
        unit="faktur"
        percentage={percentage}
        isNearLimit={isNearLimit}
        isAtLimit={isAtLimit}
        remaining={remaining}
        showUpgrade={showUpgrade}
        size={size}
        className={className}
      />
    )
  }

  // For AI
  if (type === 'ai') {
    // Unlimited plan - don't show
    if (plan.monthlyAiBudgetCents === null) {
      return null
    }

    // No AI access
    if (plan.monthlyAiBudgetCents === 0) {
      return (
        <div className={cn('p-3 rounded-lg bg-muted/50 border', className)}>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Sparkles className="h-4 w-4" />
            <span className="text-sm">AI niedostępne w planie Darmowym</span>
          </div>
          {showUpgrade && (
            <Link
              to="/settings/billing"
              className="text-xs text-primary hover:underline mt-2 inline-block"
            >
              Przejdź na Standard
            </Link>
          )}
        </div>
      )
    }

    const used = usage?.aiCostCents || 0
    const limit = plan.monthlyAiBudgetCents
    const remaining = getRemainingAiBudget() || 0
    const percentage = Math.min(100, (used / limit) * 100)
    const isNearLimit = percentage >= 80
    const isAtLimit = remaining === 0

    // Convert cents to dollars for display
    const usedDollars = (used / 100).toFixed(2)
    const limitDollars = (limit / 100).toFixed(2)

    return (
      <UsageCard
        icon={<Sparkles className="h-4 w-4" />}
        label="Budżet AI"
        used={usedDollars}
        limit={limitDollars}
        unit="USD"
        percentage={percentage}
        isNearLimit={isNearLimit}
        isAtLimit={isAtLimit}
        remaining={`$${(remaining / 100).toFixed(2)}`}
        showUpgrade={showUpgrade}
        size={size}
        className={className}
      />
    )
  }

  return null
}

interface UsageCardProps {
  icon: React.ReactNode
  label: string
  used: string | number
  limit: string | number
  unit: string
  percentage: number
  isNearLimit: boolean
  isAtLimit: boolean
  remaining: string | number
  showUpgrade: boolean
  size: 'sm' | 'md' | 'lg'
  className?: string
}

function UsageCard({
  icon,
  label,
  used,
  limit,
  unit,
  percentage,
  isNearLimit,
  isAtLimit,
  remaining,
  showUpgrade,
  size,
  className,
}: UsageCardProps): React.JSX.Element {
  const sizeClasses = {
    sm: 'p-2 text-xs',
    md: 'p-3 text-sm',
    lg: 'p-4 text-base',
  }

  return (
    <div className={cn('rounded-lg border bg-card', sizeClasses[size], className)}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <span
          className={cn(
            'font-medium',
            isAtLimit && 'text-red-500',
            isNearLimit && !isAtLimit && 'text-amber-500'
          )}
        >
          {used} / {limit} {unit}
        </span>
      </div>

      <Progress
        value={percentage}
        className={cn(
          'h-2',
          isAtLimit && '[&>div]:bg-red-500',
          isNearLimit && !isAtLimit && '[&>div]:bg-amber-500'
        )}
      />

      {(isNearLimit || isAtLimit) && (
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs">
            {isAtLimit ? (
              <>
                <AlertTriangle className="h-3 w-3 text-red-500" />
                <span className="text-red-500">Limit wyczerpany</span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-3 w-3 text-amber-500" />
                <span className="text-amber-500">Pozostało: {remaining}</span>
              </>
            )}
          </div>

          {showUpgrade && (
            <Link to="/settings/billing" className="text-xs text-primary hover:underline">
              Zwiększ limit
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Compact inline usage display (for headers, sidebars, etc.)
 */
interface UsageCompactProps {
  /** Type of usage to display */
  type: 'invoices' | 'ai'
  /** Additional CSS classes */
  className?: string
}

export function UsageCompact({ type, className }: UsageCompactProps): React.JSX.Element | null {
  const { plan, usage, loading, getRemainingInvoices, getRemainingAiBudget } = useSubscription()

  if (loading || !plan) {
    return null
  }

  if (type === 'invoices' && plan.monthlyInvoiceLimit !== null) {
    const remaining = getRemainingInvoices() || 0
    const isLow = remaining <= 5

    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 text-xs',
          isLow ? 'text-amber-500' : 'text-muted-foreground',
          className
        )}
        title={`Pozostało ${remaining} faktur w tym miesiącu`}
      >
        <FileText className="h-3 w-3" />
        {usage?.invoicesImported || 0}/{plan.monthlyInvoiceLimit}
      </span>
    )
  }

  if (type === 'ai' && plan.monthlyAiBudgetCents !== null && plan.monthlyAiBudgetCents > 0) {
    const remaining = getRemainingAiBudget() || 0
    const percentage = ((usage?.aiCostCents || 0) / plan.monthlyAiBudgetCents) * 100
    const isLow = percentage >= 80

    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 text-xs',
          isLow ? 'text-amber-500' : 'text-muted-foreground',
          className
        )}
        title={`Pozostało $${(remaining / 100).toFixed(2)} budżetu AI`}
      >
        <Sparkles className="h-3 w-3" />
        {((usage?.aiCostCents || 0) / 100).toFixed(2)}/${(plan.monthlyAiBudgetCents / 100).toFixed(2)}
      </span>
    )
  }

  return null
}
