import { useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import './AuthScreen.css'

export default function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { login, register } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (mode === 'register') {
      if (username.length < 3) {
        setError('Username must be at least 3 characters.')
        return
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters.')
        return
      }
      if (password !== confirm) {
        setError('Passwords do not match.')
        return
      }
    }

    setLoading(true)
    try {
      if (mode === 'login') {
        await login(username, password)
      } else {
        await register(username, password)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  const switchMode = () => {
    setMode(m => m === 'login' ? 'register' : 'login')
    setError('')
    setConfirm('')
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-logo">⚔️</div>
        <h1 className="auth-title">Out of Touch DND</h1>
        <h2 className="auth-subtitle">{mode === 'login' ? 'Sign In' : 'Create Account'}</h2>
        <p className="auth-migration-note">
          Supabase auth migration: legacy accounts need to re-register once.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-username">Username</label>
            <input
              id="auth-username"
              className="auth-input"
              type="text"
              autoComplete="username"
              placeholder="Enter username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              className="auth-input"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="Enter password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          {mode === 'register' && (
            <div className="auth-field">
              <label className="auth-label" htmlFor="auth-confirm">Confirm Password</label>
              <input
                id="auth-confirm"
                className="auth-input"
                type="password"
                autoComplete="new-password"
                placeholder="Confirm password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                disabled={loading}
                required
              />
            </div>
          )}

          {error && <p className="auth-error">{error}</p>}

          <button className="auth-btn primary" type="submit" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p className="auth-switch">
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
          {' '}
          <button className="auth-switch-link" type="button" onClick={switchMode}>
            {mode === 'login' ? 'Register' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}
