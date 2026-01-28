/**
 * Quick suggestion buttons for common questions
 */

import { Button } from '@/components/ui/button'
import {
  AlertTriangle,
  BarChart3,
  FileSearch,
  Users,
  Calendar,
} from 'lucide-react'

interface ChatSuggestionsProps {
  onSelect: (question: string) => void
  disabled?: boolean
}

const SUGGESTIONS = [
  {
    icon: AlertTriangle,
    label: 'Zaległości',
    question: 'Pokaż faktury po terminie płatności',
  },
  {
    icon: BarChart3,
    label: 'Statystyki',
    question: 'Pokaż ogólne statystyki faktur i płatności',
  },
  {
    icon: Users,
    label: 'Top dłużnicy',
    question: 'Którzy klienci mają największe zaległości?',
  },
  {
    icon: FileSearch,
    label: 'Niezapłacone',
    question: 'Ile mam niezapłaconych faktur?',
  },
  {
    icon: Calendar,
    label: 'Ostatnie płatności',
    question: 'Pokaż ostatnie 10 płatności',
  },
]

export function ChatSuggestions({
  onSelect,
  disabled,
}: ChatSuggestionsProps): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="text-center mb-8">
        <h3 className="text-lg font-medium mb-2">
          Witaj w AI Fakturownia
        </h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Zadaj pytanie o swoje faktury, płatności lub zaległości.
          Możesz też wybrać jedno z poniższych:
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2 max-w-2xl">
        {SUGGESTIONS.map((suggestion) => (
          <Button
            key={suggestion.label}
            variant="outline"
            size="sm"
            onClick={() => onSelect(suggestion.question)}
            disabled={disabled}
            className="gap-2"
          >
            <suggestion.icon className="h-4 w-4" />
            {suggestion.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
