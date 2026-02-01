import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface LockedFeatureProps {
  /** Content to render (will be grayed out when locked) */
  children: React.ReactNode
  /** Whether the feature is locked */
  isLocked: boolean
  /** Name of the plan required to unlock (e.g., "Standard", "Multi-Firma") */
  requiredPlan?: string
  /** Reason why the feature is locked */
  reason?: string
  /** Additional CSS classes */
  className?: string
  /** Type of CTA button */
  ctaVariant?: 'default' | 'small' | 'inline' | 'none'
  /** Custom CTA text */
  ctaText?: string
  /** Custom onClick handler (instead of navigating to billing) */
  onUpgradeClick?: () => void
}

/**
 * Wrapper component that displays locked features with an upgrade CTA.
 * When locked, the children are rendered with reduced opacity and a lock overlay.
 *
 * @example
 * ```tsx
 * <LockedFeature
 *   isLocked={!canUseAI()}
 *   requiredPlan="Standard"
 *   reason="Asystent AI wymaga planu Standard"
 * >
 *   <AIAssistantPanel />
 * </LockedFeature>
 * ```
 */
export function LockedFeature({
  children,
  isLocked,
  requiredPlan = 'Standard',
  reason = 'Ta funkcja wymaga wyższego planu',
  className,
  ctaVariant = 'default',
  ctaText,
  onUpgradeClick,
}: LockedFeatureProps): React.JSX.Element {
  const navigate = useNavigate()

  // If not locked, render children normally
  if (!isLocked) {
    return <>{children}</>
  }

  const handleUpgrade = (): void => {
    if (onUpgradeClick) {
      onUpgradeClick()
    } else {
      navigate('/settings/billing')
    }
  }

  const buttonText = ctaText || `Przejdź na ${requiredPlan}`

  return (
    <div className={cn('relative', className)}>
      {/* Grayed out content */}
      <div className="opacity-40 pointer-events-none select-none blur-[1px]">
        {children}
      </div>

      {/* Lock overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px] rounded-lg border border-dashed border-muted-foreground/30">
        <div className="text-center p-4 max-w-xs">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-3">
            <Lock className="h-6 w-6 text-muted-foreground" />
          </div>

          <p className="text-sm text-muted-foreground mb-4">{reason}</p>

          {ctaVariant === 'default' && (
            <Button onClick={handleUpgrade} size="sm">
              {buttonText}
            </Button>
          )}

          {ctaVariant === 'small' && (
            <Button onClick={handleUpgrade} size="sm" variant="outline">
              {buttonText}
            </Button>
          )}

          {ctaVariant === 'inline' && (
            <button
              onClick={handleUpgrade}
              className="text-sm text-primary hover:underline font-medium"
            >
              {buttonText}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Inline lock indicator for smaller UI elements (buttons, badges, etc.)
 * Shows a lock icon and optional tooltip on hover
 */
interface LockedBadgeProps {
  /** Whether the feature is locked */
  isLocked: boolean
  /** Tooltip text */
  tooltip?: string
  /** Additional CSS classes */
  className?: string
}

export function LockedBadge({
  isLocked,
  tooltip = 'Wymaga wyższego planu',
  className,
}: LockedBadgeProps): React.JSX.Element | null {
  if (!isLocked) {
    return null
  }

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center w-5 h-5 rounded-full bg-muted text-muted-foreground',
        className
      )}
      title={tooltip}
    >
      <Lock className="h-3 w-3" />
    </span>
  )
}

/**
 * HOC to wrap a component with lock functionality
 */
export function withLock<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  lockConfig: {
    isLocked: (props: P) => boolean
    requiredPlan?: string
    reason?: string
  }
): React.FC<P> {
  return function LockedWrapper(props: P) {
    const isLocked = lockConfig.isLocked(props)

    return (
      <LockedFeature
        isLocked={isLocked}
        requiredPlan={lockConfig.requiredPlan}
        reason={lockConfig.reason}
      >
        <WrappedComponent {...props} />
      </LockedFeature>
    )
  }
}
