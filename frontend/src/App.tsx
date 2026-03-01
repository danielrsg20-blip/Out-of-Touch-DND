import { useSessionStore } from './stores/sessionStore'
import SessionLobby from './components/SessionLobby'
import CharacterCreator from './components/CharacterCreator'
import GameBoard from './components/GameBoard'
import TableModeView from './components/TableModeView'

function isTableMode() {
  return new URLSearchParams(window.location.search).get('mode') === 'table'
}

export default function App() {
  const phase = useSessionStore(s => s.phase)

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
