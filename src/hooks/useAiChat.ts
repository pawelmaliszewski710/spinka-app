/**
 * React hook for AI Chat functionality
 */

import { useState, useCallback, useEffect } from 'react'
import { useCompany } from '@/contexts/CompanyContext'
import { sendChatMessage, AiChatApiError } from '@/lib/ai-chat-api'
import { DEFAULT_MODEL } from '@/lib/ai-models'
import type { ChatMessage, UseChatResult } from '@/types/chat'

const STORAGE_KEY_MODEL = 'ai-chat-model'
const STORAGE_KEY_MESSAGES = 'ai-chat-messages'

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

export function useAiChat(): UseChatResult {
  const { currentCompany } = useCompany()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedModel, setSelectedModelState] = useState<string>(() => {
    // Load saved model from localStorage
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY_MODEL) || DEFAULT_MODEL
    }
    return DEFAULT_MODEL
  })

  // Load messages from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && currentCompany) {
      const storageKey = `${STORAGE_KEY_MESSAGES}-${currentCompany.id}`
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          // Convert timestamp strings back to Date objects
          const messagesWithDates = parsed.map((m: ChatMessage) => ({
            ...m,
            timestamp: new Date(m.timestamp),
          }))
          setMessages(messagesWithDates)
        } catch {
          // Invalid JSON, ignore
        }
      }
    }
  }, [currentCompany])

  // Save messages to localStorage when they change
  useEffect(() => {
    if (typeof window !== 'undefined' && currentCompany && messages.length > 0) {
      const storageKey = `${STORAGE_KEY_MESSAGES}-${currentCompany.id}`
      localStorage.setItem(storageKey, JSON.stringify(messages))
    }
  }, [messages, currentCompany])

  // Save model selection to localStorage
  const setSelectedModel = useCallback((model: string) => {
    setSelectedModelState(model)
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_MODEL, model)
    }
  }, [])

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || !currentCompany) return

      setError(null)
      setIsLoading(true)

      // Add user message
      const userMessage: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: content.trim(),
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, userMessage])

      try {
        // Prepare history for API (without timestamps and ids)
        const history = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }))

        const response = await sendChatMessage({
          message: content.trim(),
          history,
          model: selectedModel,
          companyId: currentCompany.id,
        })

        // Add assistant message
        const assistantMessage: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: response.message,
          timestamp: new Date(),
          metadata: {
            model: selectedModel,
          },
        }

        setMessages((prev) => [...prev, assistantMessage])
      } catch (err) {
        const errorMessage =
          err instanceof AiChatApiError
            ? err.message
            : 'Wystąpił błąd podczas komunikacji z AI.'

        setError(errorMessage)

        // Add error message as assistant response
        const errorAssistantMessage: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: `⚠️ ${errorMessage}`,
          timestamp: new Date(),
          metadata: {
            error: true,
          },
        }

        setMessages((prev) => [...prev, errorAssistantMessage])
      } finally {
        setIsLoading(false)
      }
    },
    [currentCompany, messages, selectedModel]
  )

  const clearHistory = useCallback(() => {
    setMessages([])
    setError(null)
    if (typeof window !== 'undefined' && currentCompany) {
      const storageKey = `${STORAGE_KEY_MESSAGES}-${currentCompany.id}`
      localStorage.removeItem(storageKey)
    }
  }, [currentCompany])

  return {
    messages,
    isLoading,
    error,
    selectedModel,
    setSelectedModel,
    sendMessage,
    clearHistory,
  }
}
