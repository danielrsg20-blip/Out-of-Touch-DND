import { useEffect } from 'react'
import { useSessionStore } from './stores/sessionStore'
import { useAuthStore } from './stores/authStore'
import AuthScreen from './components/AuthScreen'
import SessionLobby from './components/SessionLobby'
import CharacterCreator from './components/CharacterCreator'
import GameBoard from './components/GameBoard'
import TableModeView from './components/TableModeView'

function isTableMode() {
  return new URLSearchParams(window.location.search).get('mode') === 'table'
}

export default function App() {
  const phase = useSessionStore(s => s.phase)
  const { isAuthenticated, isLoading, hydrateFromStorage } = useAuthStore()

  useEffect(() => {
    hydrateFromStorage()
  }, [hydrateFromStorage])

  if (isLoading) {
    return null
  }

  if (!isAuthenticated) {
    return <AuthScreen />
  }

  switch (phase) {
    case 'lobby':
      return <SessionLobby />
    case 'character_create':
      return <CharacterCreator />
    case 'playing':
      return isTableMode() ? <TableModeView /> : <GameBoard />
    default:
      return <SessionLobby />
  }
}
