import { useState } from 'react'
import type { FormEvent } from 'react'
import { confirmSignUp, signIn, signInWithHostedUi, signUp } from '../lib/auth'
import type { AuthUser } from '../lib/auth'

type Mode = 'signin' | 'signup' | 'verify'

type LoginPageProps = {
  onLogin: (user: AuthUser) => void
}

const KnottyLogo = () => (
  <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="18" cy="18" r="17" stroke="url(#lg)" strokeWidth="2" />
    <circle cx="18" cy="10" r="3.5" fill="url(#lg)" />
    <circle cx="10" cy="24" r="3.5" fill="url(#lg)" />
    <circle cx="26" cy="24" r="3.5" fill="url(#lg)" />
    <line x1="18" y1="13" x2="10" y2="21" stroke="url(#lg)" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="18" y1="13" x2="26" y2="21" stroke="url(#lg)" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="10" y1="24" x2="26" y2="24" stroke="url(#lg)" strokeWidth="1.5" strokeLinecap="round" />
    <defs>
      <linearGradient id="lg" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
        <stop stopColor="#5b8fff" />
        <stop offset="1" stopColor="#a78bfa" />
      </linearGradient>
    </defs>
  </svg>
)

export function LoginPage({ onLogin }: LoginPageProps) {
  const [mode, setMode] = useState<Mode>('signin')

  // shared fields
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  // sign-up only
  const [name, setName]               = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // verify step
  const [code, setCode] = useState('')

  const switchMode = (next: Mode) => {
    setMode(next)
    setError('')
    setCode('')
  }

  const handleHostedUi = async () => {
    setError('')
    setLoading(true)
    try {
      await signInWithHostedUi()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open Cognito. Please try again.')
      setLoading(false)
    }
  }

  // ── Sign in ────────────────────────────────────────────────────────────────
  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await signIn(email, password)
      onLogin(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Sign up ────────────────────────────────────────────────────────────────
  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      await signUp(email, password, name)
      switchMode('verify')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-up failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Verify ─────────────────────────────────────────────────────────────────
  const handleVerify = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await confirmSignUp(email, code)
      const user = await signIn(email, password)
      onLogin(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">

        {/* Brand */}
        <div className="login-brand">
          <div className="login-logo"><KnottyLogo /></div>
          <h1 className="login-title">Knotty</h1>
          <p className="login-subtitle">Your personal relationship graph</p>
        </div>

        {/* Mode tabs (hidden on verify screen) */}
        {mode !== 'verify' && (
          <div className="login-tabs">
            <button
              type="button"
              className={mode === 'signin' ? 'active' : ''}
              onClick={() => switchMode('signin')}
            >
              Sign in
            </button>
            <button
              type="button"
              className={mode === 'signup' ? 'active' : ''}
              onClick={() => switchMode('signup')}
            >
              Sign up
            </button>
          </div>
        )}

        {mode !== 'verify' && (
          <button type="button" className="login-hosted-submit" onClick={handleHostedUi} disabled={loading}>
            {loading ? <span className="login-spinner" /> : 'Continue with Cognito'}
          </button>
        )}

        {/* ── Sign in form ──────────────────────────────────────────────── */}
        {mode === 'signin' && (
          <form className="login-form" onSubmit={handleSignIn} noValidate>
            <div className="login-field">
              <label htmlFor="si-email">Email</label>
              <input
                id="si-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                disabled={loading}
              />
            </div>

            <div className="login-field">
              <div className="login-field-header">
                <label htmlFor="si-password">Password</label>
                {/* TODO: wire to Cognito resetPassword() flow */}
                <button type="button" className="login-forgot" tabIndex={-1} disabled>
                  Forgot password?
                </button>
              </div>
              <input
                id="si-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                disabled={loading}
              />
            </div>

            {error && <p className="login-error" role="alert">{error}</p>}

            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? <span className="login-spinner" /> : 'Sign in'}
            </button>
          </form>
        )}

        {/* ── Sign up form ──────────────────────────────────────────────── */}
        {mode === 'signup' && (
          <form className="login-form" onSubmit={handleSignUp} noValidate>
            <div className="login-field">
              <label htmlFor="su-name">Full name</label>
              <input
                id="su-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Smith"
                autoComplete="name"
                required
                disabled={loading}
                autoFocus
              />
            </div>

            <div className="login-field">
              <label htmlFor="su-email">Email</label>
              <input
                id="su-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                disabled={loading}
              />
            </div>

            <div className="login-field">
              <label htmlFor="su-password">Password</label>
              <input
                id="su-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                autoComplete="new-password"
                required
                disabled={loading}
              />
            </div>

            <div className="login-field">
              <label htmlFor="su-confirm">Confirm password</label>
              <input
                id="su-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                required
                disabled={loading}
              />
            </div>

            {error && <p className="login-error" role="alert">{error}</p>}

            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? <span className="login-spinner" /> : 'Create account'}
            </button>
          </form>
        )}

        {/* ── Email verification form ───────────────────────────────────── */}
        {mode === 'verify' && (
          <form className="login-form" onSubmit={handleVerify} noValidate>
            <div className="login-verify-info">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" width="28" height="28">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M2 7l10 7 10-7" />
              </svg>
              <p>We sent a 6-digit code to<br /><strong>{email}</strong></p>
            </div>

            <div className="login-field">
              <label htmlFor="verify-code">Verification code</label>
              <input
                id="verify-code"
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                autoComplete="one-time-code"
                required
                disabled={loading}
                autoFocus
                className="login-code-input"
              />
            </div>

            {error && <p className="login-error" role="alert">{error}</p>}

            <button type="submit" className="login-submit" disabled={loading || code.length < 6}>
              {loading ? <span className="login-spinner" /> : 'Verify & sign in'}
            </button>

            <button
              type="button"
              className="login-back"
              onClick={() => switchMode('signup')}
              disabled={loading}
            >
              ← Back to sign up
            </button>
          </form>
        )}

        {/* Cognito badge */}
        <p className="login-cognito-note">
          <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
            <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
          </svg>
          Secured by AWS Cognito
        </p>
      </div>
    </div>
  )
}
