import type { MapData, CombatData } from '../../types'
import { CollisionGrid } from '../../lib/systems/movement/collisionGrid'
import { MovementController } from '../../lib/systems/movement/movementController'

const TILE_SIZE = 32

export function drawOverlays(ctx: CanvasRenderingContext2D, map: MapData, combat: CombatData | null, selectedEntityId: string | null, myCharacterId: string | null) {
  if (!combat?.is_active || !selectedEntityId || !myCharacterId) return
  if (selectedEntityId !== myCharacterId) return
  if (combat.current_turn !== myCharacterId) return

  const entity = map.entities.find(e => e.id === selectedEntityId)
  if (!entity) return

  const remainingFeet = Number(combat.current_movement_remaining ?? 0)
  if (remainingFeet <= 0) return

  // Build collision grid from map data
  const grid = new CollisionGrid(map.width, map.height)
  grid.buildFromMap(map.tiles, map.width, map.height)
  // Exclude current entity from collision checking for reachability
  const otherEntities = map.entities.filter(e => e.id !== selectedEntityId)
  grid.updateEntityBlocking(otherEntities)

  // Calculate reachable tiles using the new movement system
  const reachable = MovementController.calculateReachableTiles(
    entity.x,
    entity.y,
    remainingFeet,
    grid
  )

  const entitySet = new Set(otherEntities.map(e => `${e.x},${e.y}`))

  ctx.save()
  for (const key of reachable) {
    const [x, y] = key.split(',').map(Number)
    const px = x * TILE_SIZE
    const py = y * TILE_SIZE

    if (entitySet.has(key)) {
      ctx.fillStyle = 'rgba(231, 76, 60, 0.25)'
    } else {
      ctx.fillStyle = 'rgba(52, 152, 219, 0.2)'
    }
    ctx.fillRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2)

    ctx.strokeStyle = entitySet.has(key) ? 'rgba(231, 76, 60, 0.5)' : 'rgba(52, 152, 219, 0.4)'
    ctx.lineWidth = 1
    ctx.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2)
  }
  ctx.restore()
}
