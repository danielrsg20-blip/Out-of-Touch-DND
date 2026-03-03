import type { MapData, CombatData } from '../../types'

const TILE_SIZE = 40

export function drawOverlays(ctx: CanvasRenderingContext2D, map: MapData, combat: CombatData | null, selectedEntityId: string | null, myCharacterId: string | null) {
  if (!combat?.is_active || !selectedEntityId || !myCharacterId) return
  if (selectedEntityId !== myCharacterId) return
  if (combat.current_turn !== myCharacterId) return

  const entity = map.entities.find(e => e.id === selectedEntityId)
  if (!entity) return

  const charData = combat.initiative_order.find(e => e.id === selectedEntityId)
  if (!charData) return

  const speed = 30
  const moveTiles = Math.floor(speed / 5)

  const wallSet = new Set(
    map.tiles.filter(t => t.type === 'wall' || (t.type === 'door' && t.state === 'closed') || t.type === 'pillar' || t.type === 'pit' || t.type === 'rubble')
      .map(t => `${t.x},${t.y}`)
  )
  const entitySet = new Set(map.entities.filter(e => e.id !== selectedEntityId).map(e => `${e.x},${e.y}`))

  const reachable = new Set<string>()
  const queue: Array<{ x: number; y: number; cost: number }> = [{ x: entity.x, y: entity.y, cost: 0 }]
  const visited = new Set<string>()
  visited.add(`${entity.x},${entity.y}`)

  while (queue.length > 0) {
    const current = queue.shift()!
    if (current.cost <= moveTiles) {
      reachable.add(`${current.x},${current.y}`)
    }
    if (current.cost >= moveTiles) continue

    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nx = current.x + dx
      const ny = current.y + dy
      const key = `${nx},${ny}`
      if (visited.has(key)) continue
      if (nx < 0 || nx >= map.width || ny < 0 || ny >= map.height) continue
      if (wallSet.has(key)) continue
      visited.add(key)
      queue.push({ x: nx, y: ny, cost: current.cost + 1 })
    }
  }

  reachable.delete(`${entity.x},${entity.y}`)

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
