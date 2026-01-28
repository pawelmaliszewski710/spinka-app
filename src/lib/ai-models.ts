/**
 * Available AI models for OpenRouter
 */

import type { AiModel } from '@/types/chat'

export const AI_MODELS: AiModel[] = [
  // Anthropic - recommended for tool calling
  {
    id: 'anthropic/claude-sonnet-4',
    name: 'Claude Sonnet 4',
    provider: 'Anthropic',
    description: 'Zalecany - najlepszy w tool calling i polskim języku',
  },
  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    description: 'Bardzo dobry w polskim języku',
  },
  {
    id: 'anthropic/claude-3-haiku',
    name: 'Claude 3 Haiku',
    provider: 'Anthropic',
    description: 'Szybki i tani model Claude',
  },
  // OpenAI
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    description: 'Flagowy model OpenAI',
  },
  {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'OpenAI',
    description: 'Szybki i tani, może mieć problemy z narzędziami',
  },
  // Google
  {
    id: 'google/gemini-pro-1.5',
    name: 'Gemini Pro 1.5',
    provider: 'Google',
    description: 'Model Google z dużym kontekstem',
  },
  // Meta
  {
    id: 'meta-llama/llama-3.1-70b-instruct',
    name: 'Llama 3.1 70B',
    provider: 'Meta',
    description: 'Open source model od Meta',
  },
]

export const DEFAULT_MODEL = 'anthropic/claude-sonnet-4'

export function getModelById(id: string): AiModel | undefined {
  return AI_MODELS.find((m) => m.id === id)
}

export function getModelsByProvider(provider: string): AiModel[] {
  return AI_MODELS.filter((m) => m.provider === provider)
}

export const PROVIDERS = [...new Set(AI_MODELS.map((m) => m.provider))]
