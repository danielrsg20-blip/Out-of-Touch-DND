import { useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import './AuthScreen.css'

// === PARTICLES (deterministic, defined outside component) ===
const PARTICLES = Array.from({ length: 28 }, (_, i) => {
  // Pseudo-random spread using sine/cosine of the index
  const left = ((Math.sin(i * 2.399) * 0.5 + 0.5) * 100)
  const top  = ((Math.cos(i * 1.618) * 0.5 + 0.5) * 100)
  const size = 1.5 + (Math.abs(Math.sin(i * 3.7)) * 2.5)       // 1.5–4px
  const duration = 6 + (Math.abs(Math.cos(i * 1.2)) * 10)       // 6–16s
  const delay = -(Math.abs(Math.sin(i * 0.9 + 1)) * 9)          // 0 to -9s
  const opacity = 0.12 + (Math.abs(Math.sin(i * 2.1 + 0.5)) * 0.28) // 0.12–0.4
  return { left, top, size, duration, delay, opacity, key: i }
})

// === SHIELD SVG LOGO ===
function ShieldLogo() {
  return (
    <svg
      className="auth-shield"
      viewBox="0 0 100 112"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="shieldGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e2f6e" />
          <stop offset="100%" stopColor="#0d1428" />
        </linearGradient>
        <filter id="goldGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Shield body */}
      <path
        d="M50 6 L88 20 L88 58 C88 80 68 98 50 106 C32 98 12 80 12 58 L12 20 Z"
        fill="url(#shieldGrad)"
        stroke="#e4a853"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {/* Inner shield border */}
      <path
        d="M50 6 L88 20 L88 58 C88 80 68 98 50 106 C32 98 12 80 12 58 L12 20 Z"
        fill="none"
        stroke="#e4a853"
        strokeWidth="1"
        strokeLinejoin="round"
        opacity="0.35"
        transform="scale(0.88) translate(6.8, 6.8)"
      />

      {/* Crossed swords */}
      {/* Sword 1: top-left to bottom-right */}
      <line x1="29" y1="33" x2="71" y2="75" stroke="#e4a853" strokeWidth="2.2" strokeLinecap="round" />
      {/* Sword 2: top-right to bottom-left */}
      <line x1="71" y1="33" x2="29" y2="75" stroke="#e4a853" strokeWidth="2.2" strokeLinecap="round" />

      {/* Pommel circles (top ends of swords) */}
      <circle cx="29" cy="33" r="3" fill="#e4a853" />
      <circle cx="71" cy="33" r="3" fill="#e4a853" />

      {/* Crossguard for sword 1 (~40% down from (29,33) toward (71,75)) */}
      {/* 40% point: (29 + 0.4*42, 33 + 0.4*42) = (45.8, 49.8) */}
      {/* Perpendicular direction to (42,42)/norm: (-42,42)/~59.4 → (-0.707, 0.707) */}
      <line x1="45.8" y1="49.8" x2="39.8" y2="43.8" stroke="#e4a853" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="45.8" y1="49.8" x2="51.8" y2="55.8" stroke="#e4a853" strokeWidth="1.8" strokeLinecap="round" />

      {/* Crossguard for sword 2 (~40% down from (71,33) toward (29,75)) */}
      {/* 40% point: (71 + 0.4*(-42), 33 + 0.4*42) = (54.2, 49.8) */}
      <line x1="54.2" y1="49.8" x2="60.2" y2="43.8" stroke="#e4a853" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="54.2" y1="49.8" x2="48.2" y2="55.8" stroke="#e4a853" strokeWidth="1.8" strokeLinecap="round" />

      {/* Center medallion */}
      <circle cx="50" cy="54" r="13.5" fill="#0c1220" stroke="#e4a853" strokeWidth="1.5" />
      {/* Inner ring */}
      <circle cx="50" cy="54" r="10.5" fill="none" stroke="#e4a853" strokeWidth="0.5" opacity="0.4" />

      {/* D20 pentagon */}
      <polygon
        points="50,43.5 58.5,49 55.5,60.5 44.5,60.5 41.5,49"
        fill="none"
        stroke="#e4a853"
        strokeWidth="0.8"
        opacity="0.6"
      />

      {/* "20" text */}
      <text
        x="50"
        y="57.5"
        textAnchor="middle"
        fill="#e4a853"
        fontSize="9.5"
        fontWeight="bold"
        fontFamily="Georgia, serif"
      >
        20
      </text>
    </svg>
  )
}

// === EYE ICON ===
function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    // Eye open
    return (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path
          d="M1 12C1 12 5 5 12 5C19 5 23 12 23 12C23 12 19 19 12 19C5 19 1 12 1 12Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    )
  }
  // Eye with slash
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M3 3L21 21"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M10.58 10.58A3 3 0 0 0 13.42 13.42M7.37 7.37C5.27 8.7 3.5 10.74 2 12c2 3.33 5.5 7 10 7a9.6 9.6 0 0 0 4.62-1.18M9.9 5.13A9.7 9.7 0 0 1 12 5c4.5 0 8 3.67 10 7-0.72 1.2-1.65 2.37-2.73 3.35"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// === SPINNER ===
function Spinner() {
  return <span className="auth-spinner" aria-hidden="true" />
}

// === MAIN COMPONENT ===
export default function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm]   = useState(false)

  const { login, register } = useAuthStore()

  // Real-time validation (register mode)
  const usernameValid = username.length >= 3
  const passwordValid = password.length >= 6
  const confirmValid  = confirm.length > 0 && confirm === password

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
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
      {/* Particles */}
      <div className="auth-particles" aria-hidden="true">
        {PARTICLES.map(p => (
          <span
            key={p.key}
            className="auth-particle"
            style={{
              left: `${p.left}%`,
              top: `${p.top}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
              opacity: p.opacity,
            }}
          />
        ))}
      </div>

      <div className="auth-card">
        <ShieldLogo />
        <h1 className="auth-title">Out of Touch DND</h1>
        <h2 className="auth-subtitle">{mode === 'login' ? 'Sign In' : 'Create Account'}</h2>

        <form className="auth-form" onSubmit={handleSubmit}>

          {/* Username */}
          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-username">
              Username
              {mode === 'register' && username.length > 0 && (
                <span className={`auth-hint ${usernameValid ? 'valid' : 'invalid'}`}>
                  {usernameValid ? '✓' : 'min 3 chars'}
                </span>
              )}
            </label>
            <input
              id="auth-username"
              className={`auth-input${mode === 'register' && username.length > 0 ? (usernameValid ? ' valid' : ' invalid') : ''}`}
              type="text"
              autoComplete="username"
              placeholder="Enter username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          {/* Password */}
          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-password">
              Password
              {mode === 'register' && password.length > 0 && (
                <span className={`auth-hint ${passwordValid ? 'valid' : 'invalid'}`}>
                  {passwordValid ? '✓' : 'min 6 chars'}
                </span>
              )}
            </label>
            <div className="auth-input-wrap">
              <input
                id="auth-password"
                className={`auth-input${mode === 'register' && password.length > 0 ? (passwordValid ? ' valid' : ' invalid') : ''}`}
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder="Enter password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={loading}
                required
              />
              <button
                type="button"
                className="auth-eye-btn"
                tabIndex={-1}
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
          </div>

          {/* Confirm Password (register only) */}
          {mode === 'register' && (
            <div className="auth-field">
              <label className="auth-label" htmlFor="auth-confirm">
                Confirm Password
                {confirm.length > 0 && (
                  <span className={`auth-hint ${confirmValid ? 'valid' : 'invalid'}`}>
                    {confirmValid ? '✓ Match' : '✗ No match'}
                  </span>
                )}
              </label>
              <div className="auth-input-wrap">
                <input
                  id="auth-confirm"
                  className={`auth-input${confirm.length > 0 ? (confirmValid ? ' valid' : ' invalid') : ''}`}
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Confirm password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  disabled={loading}
                  required
                />
                <button
                  type="button"
                  className="auth-eye-btn"
                  tabIndex={-1}
                  onClick={() => setShowConfirm(v => !v)}
                  aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                >
                  <EyeIcon open={showConfirm} />
                </button>
              </div>
            </div>
          )}

          {error && <p className="auth-error">{error}</p>}

          <button className="auth-btn primary" type="submit" disabled={loading}>
            {loading
              ? <Spinner />
              : mode === 'login' ? 'Sign In' : 'Create Account'
            }
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
