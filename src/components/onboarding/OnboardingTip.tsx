import { useState, useEffect } from 'react'
import { X, Lightbulb, ArrowRight, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface OnboardingStep {
  title: string
  description: string
  action?: string
}

interface OnboardingTipProps {
  id: string // Unique ID for this tip (used for localStorage)
  title: string
  description: string
  steps?: OnboardingStep[]
  icon?: React.ReactNode
  variant?: 'default' | 'info' | 'success'
  className?: string
  dismissible?: boolean
  showOnce?: boolean // Only show once per user
}

const STORAGE_KEY = 'spinka_onboarding_dismissed'

function getDismissedTips(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function setTipDismissed(id: string) {
  try {
    const dismissed = getDismissedTips()
    if (!dismissed.includes(id)) {
      dismissed.push(id)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dismissed))
    }
  } catch {
    // Ignore storage errors
  }
}

export function OnboardingTip({
  id,
  title,
  description,
  steps,
  icon,
  variant = 'default',
  className,
  dismissible = true,
  showOnce = true,
}: OnboardingTipProps): React.JSX.Element | null {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (showOnce) {
      const dismissed = getDismissedTips()
      if (!dismissed.includes(id)) {
        setIsVisible(true)
      }
    } else {
      setIsVisible(true)
    }
  }, [id, showOnce])

  const handleDismiss = () => {
    setIsVisible(false)
    if (showOnce) {
      setTipDismissed(id)
    }
  }

  if (!isVisible) return null

  const variantStyles = {
    default: 'border-primary/30 bg-primary/5',
    info: 'border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30',
    success: 'border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30',
  }

  const iconColors = {
    default: 'text-primary',
    info: 'text-blue-600 dark:text-blue-400',
    success: 'text-green-600 dark:text-green-400',
  }

  return (
    <div
      className={cn(
        'relative rounded-xl border-2 p-4 transition-all',
        variantStyles[variant],
        className
      )}
    >
      {dismissible && (
        <button
          onClick={handleDismiss}
          className="absolute right-3 top-3 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Zamknij podpowiedź"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      <div className="flex gap-4">
        <div className={cn('mt-0.5 flex-shrink-0', iconColors[variant])}>
          {icon || <Lightbulb className="h-5 w-5" />}
        </div>

        <div className="flex-1 space-y-3 pr-6">
          <div>
            <h4 className="font-semibold">{title}</h4>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>

          {steps && steps.length > 0 && (
            <div className="space-y-2">
              {steps.map((step, index) => (
                <div key={index} className="flex items-start gap-2">
                  <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{step.title}</p>
                    {step.description && (
                      <p className="text-xs text-muted-foreground">{step.description}</p>
                    )}
                    {step.action && (
                      <span className="mt-1 inline-flex items-center text-xs font-medium text-primary">
                        {step.action}
                        <ChevronRight className="ml-0.5 h-3 w-3" />
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {dismissible && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="mt-2 h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
            >
              Rozumiem, nie pokazuj ponownie
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// Helper to reset all onboarding tips (for testing)
export function resetOnboarding() {
  localStorage.removeItem(STORAGE_KEY)
}

export default OnboardingTip
