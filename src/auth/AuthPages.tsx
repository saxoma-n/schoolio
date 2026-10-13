import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function AuthForm(props: { title: string; submit: string; onSubmit(): Promise<string | null>; children: ReactNode; footer?: ReactNode }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const handle = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(await props.onSubmit())
    setBusy(false)
  }
  return (
    <main className="auth">
      <form onSubmit={handle}>
        <h1>{props.title}</h1>
        {props.children}
        {error && <p role="alert" className="error">{error}</p>}
        <button type="submit" disabled={busy}>{props.submit}</button>
        {props.footer}
      </form>
    </main>
  )
}

function Field(props: { label: string; type: string; value: string; onChange(v: string): void; autoComplete: string }) {
  return (
    <label>
      {props.label}
      <input type={props.type} value={props.value} onChange={(e) => props.onChange(e.target.value)} autoComplete={props.autoComplete} required />
    </label>
  )
}

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  return (
    <AuthForm
      title="Log in"
      submit="Log in"
      onSubmit={async () => (await supabase.auth.signInWithPassword({ email: email.trim(), password })).error?.message ?? null}
      footer={<p><Link to="/signup">Create an account</Link> · <Link to="/reset">Forgot password?</Link></p>}
    >
      <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
      <Field label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
    </AuthForm>
  )
}

export function Signup() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const submit = async () => {
    const { error } = await supabase.auth.signUp({ email: email.trim().toLowerCase(), password })
    if (!error) return null
    // The allowlist trigger surfaces as a generic database error from Supabase Auth.
    return error.message.includes('Database error') ? "This email isn't invited." : error.message
  }
  return (
    <AuthForm title="Sign up" submit="Sign up" onSubmit={submit} footer={<p><Link to="/login">Already have an account?</Link></p>}>
      <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
      <Field label="Password" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
    </AuthForm>
  )
}

export function ResetPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const submit = async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + import.meta.env.BASE_URL })
    if (error) return error.message
    setSent(true)
    return null
  }
  return (
    <AuthForm title="Reset password" submit="Send reset link" onSubmit={submit} footer={<p><Link to="/login">Back to log in</Link></p>}>
      <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
      {sent && <p>Check your email for a reset link.</p>}
    </AuthForm>
  )
}

export function UpdatePassword() {
  const [password, setPassword] = useState('')
  const navigate = useNavigate()
  const submit = async () => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return error.message
    navigate('/')
    return null
  }
  return (
    <AuthForm title="Set a new password" submit="Save password" onSubmit={submit}>
      <Field label="New password" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
    </AuthForm>
  )
}
