/**
 * AI Chat API Client
 *
 * Communicates with the ai-chat Edge Function which proxies
 * requests to OpenRouter API for AI responses.
 */

import { supabase } from './supabase'
import type { ChatRequest, ChatResponse } from '@/types/chat'

// Supabase Edge Function URL for AI Chat
const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`

// Error class for API errors
export class AiChatApiError extends Error {
  statusCode?: number

  constructor(message: string, statusCode?: number) {
    super(message)
    this.name = 'AiChatApiError'
    this.statusCode = statusCode
  }
}

/**
 * Send a chat message to the AI
 */
export async function sendChatMessage(request: ChatRequest): Promise<ChatResponse> {
  // Get current session for authentication
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()

  if (sessionError || !session) {
    throw new AiChatApiError('Nie jesteś zalogowany. Zaloguj się ponownie.', 401)
  }

  try {
    // Get the anon key for Supabase Edge Function authentication
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: anonKey,
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData.error || `Błąd serwera: ${response.status}`

      if (response.status === 401) {
        throw new AiChatApiError('Sesja wygasła. Zaloguj się ponownie.', 401)
      }
      if (response.status === 403) {
        throw new AiChatApiError('Brak dostępu do tej funkcji.', 403)
      }
      if (response.status === 429) {
        throw new AiChatApiError('Zbyt wiele zapytań. Poczekaj chwilę.', 429)
      }
      if (response.status === 500) {
        throw new AiChatApiError(errorMessage, 500)
      }

      throw new AiChatApiError(errorMessage, response.status)
    }

    const data: ChatResponse = await response.json()
    return data
  } catch (error) {
    if (error instanceof AiChatApiError) {
      throw error
    }

    // Network or other errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new AiChatApiError('Brak połączenia z serwerem. Sprawdź połączenie internetowe.')
    }

    throw new AiChatApiError(
      error instanceof Error ? error.message : 'Nieznany błąd podczas komunikacji z AI.'
    )
  }
}

/**
 * Check if AI Chat is configured (OpenRouter API key is set)
 */
export async function checkAiChatConfig(): Promise<{ configured: boolean; error?: string }> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()

  if (sessionError || !session) {
    return { configured: false, error: 'Nie jesteś zalogowany.' }
  }

  try {
    // Get the anon key for Supabase Edge Function authentication
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

    const response = await fetch(`${EDGE_FUNCTION_URL}/health`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: anonKey,
      },
    })

    if (response.ok) {
      return { configured: true }
    }

    const data = await response.json().catch(() => ({}))
    return { configured: false, error: data.error || 'AI Chat nie jest skonfigurowany.' }
  } catch {
    return { configured: false, error: 'Nie można połączyć się z serwerem.' }
  }
}
