/**
 * Chat message types for AI Fakturownia chatbot
 */

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  metadata?: {
    model?: string
    queryType?: string
    dataCount?: number
    error?: boolean
  }
}

export interface ChatRequest {
  message: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  model: string
  companyId: string
}

export interface ChatResponse {
  message: string
  data?: unknown
  suggestions?: string[]
  error?: string
}

export interface AiModel {
  id: string
  name: string
  provider: string
  description?: string
}

export interface UseChatResult {
  messages: ChatMessage[]
  isLoading: boolean
  error: string | null
  selectedModel: string
  setSelectedModel: (model: string) => void
  sendMessage: (message: string) => Promise<void>
  clearHistory: () => void
}
