import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useAuthStore } from '../stores/authStore'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// === PARTICLES (deterministic, defined outside component) ===
const PARTICLES = Array.from({ length: 28 }, (_, i) => {
  const left     = ((Math.sin(i * 2.399) * 0.5 + 0.5) * 100)
  const top      = ((Math.cos(i * 1.618) * 0.5 + 0.5) * 100)
  const size     = 1.5 + (Math.abs(Math.sin(i * 3.7)) * 2.5)
  const duration = 6 + (Math.abs(Math.cos(i * 1.2)) * 10)
  const delay    = -(Math.abs(Math.sin(i * 0.9 + 1)) * 9)
  const opacity  = 0.12 + (Math.abs(Math.sin(i * 2.1 + 0.5)) * 0.28)
  const xDrift   = 3 + Math.abs(Math.sin(i * 1.7)) * 6
  const yDrift   = 18 + Math.abs(Math.cos(i * 2.3)) * 10
  return { left, top, size, duration, delay, opacity, xDrift, yDrift, key: i }
})

// === SHIELD SVG LOGO ===
function ShieldLogo() {
  return (
    <svg
      className="w-[74px] h-[83px]"
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
      <path d="M50 6 L88 20 L88 58 C88 80 68 98 50 106 C32 98 12 80 12 58 L12 20 Z" fill="url(#shieldGrad)" stroke="#e4a853" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M50 6 L88 20 L88 58 C88 80 68 98 50 106 C32 98 12 80 12 58 L12 20 Z" fill="none" stroke="#e4a853" strokeWidth="1" strokeLinejoin="round" opacity="0.35" transform="scale(0.88) translate(6.8, 6.8)" />
      <line x1="29" y1="33" x2="71" y2="75" stroke="#e4a853" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="71" y1="33" x2="29" y2="75" stroke="#e4a853" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="29" cy="33" r="3" fill="#e4a853" />
      <circle cx="71" cy="33" r="3" fill="#e4a853" />
      <line x1="45.8" y1="49.8" x2="39.8" y2="43.8" stroke="#e4a853" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="45.8" y1="49.8" x2="51.8" y2="55.8" stroke="#e4a853" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="54.2" y1="49.8" x2="60.2" y2="43.8" stroke="#e4a853" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="54.2" y1="49.8" x2="48.2" y2="55.8" stroke="#e4a853" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="50" cy="54" r="13.5" fill="#0c1220" stroke="#e4a853" strokeWidth="1.5" />
      <circle cx="50" cy="54" r="10.5" fill="none" stroke="#e4a853" strokeWidth="0.5" opacity="0.4" />
      <polygon points="50,43.5 58.5,49 55.5,60.5 44.5,60.5 41.5,49" fill="none" stroke="#e4a853" strokeWidth="0.8" opacity="0.6" />
      <text x="50" y="57.5" textAnchor="middle" fill="#e4a853" fontSize="9.5" fontWeight="bold" fontFamily="Georgia, serif">20</text>
    </svg>
  )
}

// === EYE ICON ===
function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg className="w-[17px] h-[17px] block" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M1 12C1 12 5 5 12 5C19 5 23 12 23 12C23 12 19 19 12 19C5 19 1 12 1 12Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    )
  }
  return (
    <svg className="w-[17px] h-[17px] block" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M3 3L21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10.58 10.58A3 3 0 0 0 13.42 13.42M7.37 7.37C5.27 8.7 3.5 10.74 2 12c2 3.33 5.5 7 10 7a9.6 9.6 0 0 0 4.62-1.18M9.9 5.13A9.7 9.7 0 0 1 12 5c4.5 0 8 3.67 10 7-0.72 1.2-1.65 2.37-2.73 3.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// === MAIN COMPONENT ===
export default function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername]         = useState('')
  const [password, setPassword]         = useState('')
  const [confirm, setConfirm]           = useState('')
  const [error, setError]               = useState('')
  const [loading, setLoading]           = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm]   = useState(false)

  const { login, register } = useAuthStore()

  const usernameValid = username.length >= 3
  const passwordValid = password.length >= 6
  const confirmValid  = confirm.length > 0 && confirm === password

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')

    if (mode === 'register') {
      if (username.length < 3) { setError('Username must be at least 3 characters.'); return }
      if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
      if (password !== confirm) { setError('Passwords do not match.'); return }
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
    <div
      className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 30% 40%, #1a2860 0%, #090d1f 55%, #0d0812 100%)' }}
    >
      {/* Scanline texture */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.04) 2px, rgba(0,0,0,0.04) 4px)' }}
        aria-hidden="true"
      />
      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.55) 100%)' }}
        aria-hidden="true"
      />

      {/* Particles */}
      <div className="absolute inset-0 pointer-events-none z-0" aria-hidden="true">
        {PARTICLES.map(p => (
          <motion.span
            key={p.key}
            className="absolute rounded-full"
            style={{
              left: `${p.left}%`,
              top: `${p.top}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              opacity: p.opacity,
              background: '#e4a853',
              boxShadow: '0 0 5px 1px rgba(228, 168, 83, 0.5)',
            }}
            animate={{
              x: [0, p.xDrift, -p.xDrift / 2, 0],
              y: [0, -p.yDrift, -p.yDrift * 0.4, 0],
              scale: [1, 1.15, 0.9, 1],
            }}
            transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}
      </div>

      {/* Card */}
      <motion.div
        className="relative z-10 w-full max-w-[390px]"
        initial={{ opacity: 0, y: 28, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <Card
          className="flex flex-col items-center py-10 px-8 bg-[rgba(18,27,56,0.93)] border-[rgba(228,168,83,0.3)] rounded-2xl"
          style={{ boxShadow: '0 8px 48px rgba(0,0,0,0.75), 0 0 0 1px rgba(228,168,83,0.07), inset 0 1px 0 rgba(228,168,83,0.12)' }}
        >
          {/* Shield with glow pulse */}
          <motion.div
            className="mb-3.5"
            animate={{
              filter: [
                'drop-shadow(0 0 5px rgba(228,168,83,0.28))',
                'drop-shadow(0 0 14px rgba(228,168,83,0.65))',
                'drop-shadow(0 0 5px rgba(228,168,83,0.28))',
              ],
            }}
            transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ShieldLogo />
          </motion.div>

          <h1 className="text-xl font-bold text-[#e4a853] tracking-[0.06em] uppercase mb-1 text-center">
            Out of Touch DND
          </h1>
          <h2 className="text-sm text-[#a0a0b0] mb-7 font-normal">
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </h2>

          <form className="w-full flex flex-col gap-4" onSubmit={handleSubmit}>

            {/* Username */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="auth-username" className="text-[0.75rem] uppercase tracking-[0.07em] text-[#a0a0b0] flex items-center gap-1.5">
                Username
                {mode === 'register' && username.length > 0 && (
                  <span className={cn('text-[0.7rem] font-semibold normal-case tracking-normal', usernameValid ? 'text-[#2ecc71]' : 'text-[#e74c3c]')}>
                    {usernameValid ? '✓' : 'min 3 chars'}
                  </span>
                )}
              </label>
              <Input
                id="auth-username"
                type="text"
                autoComplete="username"
                placeholder="Enter username"
                value={username}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
                disabled={loading}
                required
                className={cn(
                  'bg-[rgba(26,26,62,0.85)] text-[#e0e0e0] placeholder:text-[#a0a0b0]/50',
                  mode === 'register' && username.length > 0 && usernameValid  && 'border-[rgba(46,204,113,0.7)]',
                  mode === 'register' && username.length > 0 && !usernameValid && 'border-[rgba(231,76,60,0.65)]',
                )}
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="auth-password" className="text-[0.75rem] uppercase tracking-[0.07em] text-[#a0a0b0] flex items-center gap-1.5">
                Password
                {mode === 'register' && password.length > 0 && (
                  <span className={cn('text-[0.7rem] font-semibold normal-case tracking-normal', passwordValid ? 'text-[#2ecc71]' : 'text-[#e74c3c]')}>
                    {passwordValid ? '✓' : 'min 6 chars'}
                  </span>
                )}
              </label>
              <div className="relative flex items-center">
                <Input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder="Enter password"
                  value={password}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                  className={cn(
                    'bg-[rgba(26,26,62,0.85)] text-[#e0e0e0] placeholder:text-[#a0a0b0]/50 pr-10',
                    mode === 'register' && password.length > 0 && passwordValid  && 'border-[rgba(46,204,113,0.7)]',
                    mode === 'register' && password.length > 0 && !passwordValid && 'border-[rgba(231,76,60,0.65)]',
                  )}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 flex items-center justify-center p-1 bg-transparent border-none text-[#a0a0b0] hover:text-[#e4a853] transition-colors cursor-pointer"
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
            </div>

            {/* Confirm Password (register only) */}
            {mode === 'register' && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="auth-confirm" className="text-[0.75rem] uppercase tracking-[0.07em] text-[#a0a0b0] flex items-center gap-1.5">
                  Confirm Password
                  {confirm.length > 0 && (
                    <span className={cn('text-[0.7rem] font-semibold normal-case tracking-normal', confirmValid ? 'text-[#2ecc71]' : 'text-[#e74c3c]')}>
                      {confirmValid ? '✓ Match' : '✗ No match'}
                    </span>
                  )}
                </label>
                <div className="relative flex items-center">
                  <Input
                    id="auth-confirm"
                    type={showConfirm ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Confirm password"
                    value={confirm}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirm(e.target.value)}
                    disabled={loading}
                    required
                    className={cn(
                      'bg-[rgba(26,26,62,0.85)] text-[#e0e0e0] placeholder:text-[#a0a0b0]/50 pr-10',
                      confirm.length > 0 && confirmValid  && 'border-[rgba(46,204,113,0.7)]',
                      confirm.length > 0 && !confirmValid && 'border-[rgba(231,76,60,0.65)]',
                    )}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowConfirm(v => !v)}
                    aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                    className="absolute right-2 flex items-center justify-center p-1 bg-transparent border-none text-[#a0a0b0] hover:text-[#e4a853] transition-colors cursor-pointer"
                  >
                    <EyeIcon open={showConfirm} />
                  </button>
                </div>
              </div>
            )}

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.p
                  key="error"
                  initial={{ opacity: 0, x: -5 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-[#e74c3c] text-sm m-0 px-2.5 py-1.5 bg-[rgba(231,76,60,0.1)] border-l-[3px] border-[#e74c3c] rounded-sm"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <Button
              type="submit"
              disabled={loading}
              className="mt-1 min-h-[42px] bg-linear-to-br from-[#e4a853] to-[#c8882a] text-[#1a1a2e] font-semibold border-none hover:opacity-90 hover:-translate-y-px active:translate-y-0 disabled:opacity-45"
              style={{ boxShadow: '0 4px 14px rgba(228,168,83,0.22)' }}
            >
              {loading ? (
                <span className="inline-block w-4 h-4 border-2 border-[rgba(26,26,46,0.3)] border-t-[#1a1a2e] rounded-full animate-spin" />
              ) : (
                mode === 'login' ? 'Sign In' : 'Create Account'
              )}
            </Button>
          </form>

          <p className="mt-6 text-sm text-[#a0a0b0] text-center">
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
            {' '}
            <Button
              variant="link"
              type="button"
              onClick={switchMode}
              className="text-[#e4a853] p-0 h-auto text-sm underline underline-offset-2 hover:opacity-80 hover:no-underline"
            >
              {mode === 'login' ? 'Register' : 'Sign in'}
            </Button>
          </p>
        </Card>
      </motion.div>
    </div>
  )
}
