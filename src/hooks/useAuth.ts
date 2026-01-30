import { useState, useEffect, useCallback } from 'react'
import type { User, AuthError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthState {
  user: User | null
  loading: boolean
  error: AuthError | null
}

interface UseAuthReturn extends AuthState {
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>
  signInWithGoogle: () => Promise<{ error: AuthError | null }>
  signOut: () => Promise<void>
  clearError: () => void
}

export function useAuth(): UseAuthReturn {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState((prev) => ({
        ...prev,
        user: session?.user ?? null,
        loading: false,
      }))
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setState((prev) => ({
        ...prev,
        user: session?.user ?? null,
        loading: false,
      }))
    })

    return () => subscription.unsubscribe()
  }, [])

  const signUp = useCallback(
    async (email: string, password: string): Promise<{ error: AuthError | null }> => {
      setState((prev) => ({ ...prev, loading: true, error: null }))

      const { error } = await supabase.auth.signUp({
        email,
        password,
      })

      setState((prev) => ({
        ...prev,
        loading: false,
        error: error,
      }))

      return { error }
    },
    []
  )

  const signIn = useCallback(
    async (email: string, password: string): Promise<{ error: AuthError | null }> => {
      setState((prev) => ({ ...prev, loading: true, error: null }))

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      setState((prev) => ({
        ...prev,
        loading: false,
        error: error,
      }))

      return { error }
    },
    []
  )

  const signInWithGoogle = useCallback(async (): Promise<{ error: AuthError | null }> => {
    setState((prev) => ({ ...prev, loading: true, error: null }))

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    })

    if (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error,
      }))
    }

    return { error }
  }, [])

  const signOut = useCallback(async (): Promise<void> => {
    setState((prev) => ({ ...prev, loading: true }))
    await supabase.auth.signOut()
    setState((prev) => ({ ...prev, user: null, loading: false }))
  }, [])

  const clearError = useCallback((): void => {
    setState((prev) => ({ ...prev, error: null }))
  }, [])

  return {
    ...state,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    clearError,
  }
}
