/**
 * Model selector dropdown for choosing AI model
 */

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AI_MODELS, PROVIDERS, getModelById } from '@/lib/ai-models'

interface ChatModelSelectorProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function ChatModelSelector({
  value,
  onChange,
  disabled,
}: ChatModelSelectorProps): React.JSX.Element {
  const currentModel = getModelById(value)

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-[220px]">
        <SelectValue>
          {currentModel ? currentModel.name : 'Wybierz model'}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {PROVIDERS.map((provider) => (
          <SelectGroup key={provider}>
            <SelectLabel>{provider}</SelectLabel>
            {AI_MODELS.filter((m) => m.provider === provider).map((model) => (
              <SelectItem key={model.id} value={model.id}>
                <div className="flex flex-col">
                  <span>{model.name}</span>
                  {model.description && (
                    <span className="text-xs text-muted-foreground">
                      {model.description}
                    </span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}
