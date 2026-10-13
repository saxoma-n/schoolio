import type { Session } from '@supabase/supabase-js'
import { createContext, startTransition, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type AuthState = { session: Session | null; loading: boolean; signOut(): Promise<void> }

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const nav = useNavigate()
  const navigate = useRef(nav)
  navigate.current = nav

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setLoading(false)
      if (event !== 'PASSWORD_RECOVERY') return setSession(s)
      // Router navigations are transitions; batch the session with it so /login never renders signed-in
      startTransition(() => {
        setSession(s)
        navigate.current('/update-password')
      })
    })
    return () => data.subscription.unsubscribe()
  }, []) // subscribe once; navigate changes identity on every route change

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return <AuthContext.Provider value={{ session, loading, signOut }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
