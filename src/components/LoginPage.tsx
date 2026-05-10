import { useState } from 'react'
import type { FormEvent } from 'react'
import { signIn } from '../lib/auth'
import type { AuthUser } from '../lib/auth'

type LoginPageProps = {
  onLogin: (user: AuthUser) => void
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
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

  return (
    <div className="login-shell">
      <div className="login-card">
        {/* Brand */}
        <div className="login-brand">
          <div className="login-logo">
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
          </div>
          <h1 className="login-title">Knotty</h1>
          <p className="login-subtitle">Your personal relationship graph</p>
        </div>

        {/* Form */}
        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <div className="login-field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
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
              <label htmlFor="login-password">Password</label>
              {/* TODO: wire to Cognito forgot-password flow */}
              <button type="button" className="login-forgot" tabIndex={-1} disabled>
                Forgot password?
              </button>
            </div>
            <input
              id="login-password"
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
            {loading
              ? <span className="login-spinner" />
              : 'Sign in'}
          </button>
        </form>

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
