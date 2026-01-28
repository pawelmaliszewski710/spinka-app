/**
 * Main chat container component
 */

import { useEffect, useRef } from 'react'
import { useAiChat } from '@/hooks/useAiChat'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { ChatSuggestions } from './ChatSuggestions'
import { ChatModelSelector } from './ChatModelSelector'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'

export function ChatContainer(): React.JSX.Element {
  const {
    messages,
    isLoading,
    selectedModel,
    setSelectedModel,
    sendMessage,
    clearHistory,
  } = useAiChat()

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] min-h-[500px]">
      {/* Header with model selector */}
      <div className="flex items-center justify-between gap-4 p-4 border-b">
        <ChatModelSelector
          value={selectedModel}
          onChange={setSelectedModel}
          disabled={isLoading}
        />

        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearHistory}
            disabled={isLoading}
            className="text-muted-foreground"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Wyczyść historię
          </Button>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <ChatSuggestions onSelect={sendMessage} disabled={isLoading} />
        ) : (
          <div className="space-y-2 p-4">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex gap-3 p-4 rounded-lg bg-muted/50">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted-foreground/20">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" />
                    <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.1s]" />
                    <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.2s]" />
                  </div>
                </div>
                <div className="flex items-center text-sm text-muted-foreground">
                  AI myśli...
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <ChatInput onSend={sendMessage} isLoading={isLoading} />
    </div>
  )
}
