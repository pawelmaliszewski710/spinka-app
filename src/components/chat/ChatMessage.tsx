/**
 * Individual chat message component
 */

import { cn } from '@/lib/utils'
import { User, Bot } from 'lucide-react'
import type { ChatMessage as ChatMessageType } from '@/types/chat'

interface ChatMessageProps {
  message: ChatMessageType
}

export function ChatMessage({ message }: ChatMessageProps): React.JSX.Element {
  const isUser = message.role === 'user'
  const isError = message.metadata?.error

  return (
    <div
      className={cn(
        'flex gap-3 p-4 rounded-lg',
        isUser ? 'bg-primary/5' : 'bg-muted/50',
        isError && 'bg-destructive/10'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/20'
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      {/* Content */}
      <div className="flex-1 space-y-1 overflow-hidden">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {isUser ? 'Ty' : 'AI Asystent'}
          </span>
          <span className="text-xs text-muted-foreground">
            {message.timestamp.toLocaleTimeString('pl-PL', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>

        {/* Message content with whitespace preserved */}
        <div
          className={cn(
            'text-sm whitespace-pre-wrap break-words',
            isError && 'text-destructive'
          )}
        >
          {message.content}
        </div>

        {/* Model info for assistant messages */}
        {!isUser && message.metadata?.model && (
          <div className="text-xs text-muted-foreground mt-2">
            Model: {message.metadata.model.split('/').pop()}
          </div>
        )}
      </div>
    </div>
  )
}
