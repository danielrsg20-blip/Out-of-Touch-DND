import {
  buildWalkableMatrixFromTraversalGrid,
  calculateTraversalPathWorldCostFromMapPath,
  getTraversalGridFromMap,
  movementCostMultiplierForMapTileFromTraversalGrid,
} from './vectorMap/runtime.js'

type JsonRecord = Record<string, unknown>

export type NavNode = {
  x: number
  y: number
}

export type MovementValidationResult = {
  valid: boolean
  error: string | null
  path: NavNode[] | null
  distance_feet: number | null
}

type MapLike = {
  width: number
  height: number
  tiles?: unknown
  entities?: unknown
}

function keyOf(node: NavNode): string {
  return `${node.x},${node.y}`
}

function normalizeMapDimensions(map: JsonRecord | null): { width: number; height: number } | null {
  if (!map) {
    return null
  }
  const width = typeof map.width === 'number' && Number.isFinite(map.width) ? Math.trunc(map.width) : null
  const height = typeof map.height === 'number' && Number.isFinite(map.height) ? Math.trunc(map.height) : null
  if (width === null || height === null || width <= 0 || height <= 0) {
    return null
  }
  return { width, height }
}

function resolveMapModeForMovement(map: JsonRecord | null): 'ai_generated_image' {
  const metadata = map?.metadata
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return 'ai_generated_image'
  }
  const m = metadata as JsonRecord
  const explicit = typeof m.map_mode === 'string' ? m.map_mode.trim().toLowerCase() : ''
  if (explicit === 'ai_generated_image') {
    return 'ai_generated_image'
  }
  const imageUrl = typeof m.image_url === 'string' ? m.image_url.trim() : ''
  const source = typeof m.map_source === 'string' ? m.map_source.trim().toLowerCase() : ''
  if (imageUrl.length > 0 || source.includes('vector')) {
    return 'ai_generated_image'
  }
  return 'ai_generated_image'
}

function normalizeMapEntities(map: JsonRecord | null): Array<{ id: string; x: number; y: number; blocksMovement: boolean }> {
  if (!map) {
    return []
  }

  const raw = map.entities
  const out: Array<{ id: string; x: number; y: number; blocksMovement: boolean }> = []

  const normalizeEntity = (entity: unknown): { id: string; x: number; y: number; blocksMovement: boolean } | null => {
    if (!entity || typeof entity !== 'object' || Array.isArray(entity)) {
      return null
    }
    const e = entity as JsonRecord
    const id = typeof e.id === 'string' ? e.id : null
    const x = typeof e.x === 'number' && Number.isFinite(e.x) ? Math.trunc(e.x) : null
    const y = typeof e.y === 'number' && Number.isFinite(e.y) ? Math.trunc(e.y) : null
    if (!id || x === null || y === null) {
      return null
    }
    const blocksMovement = typeof e.blocks_movement === 'boolean'
      ? e.blocks_movement
      : typeof e.blocksMovement === 'boolean'
        ? e.blocksMovement
        : true
    return { id, x, y, blocksMovement }
  }

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const entity = normalizeEntity(entry)
      if (entity) {
        out.push(entity)
      }
    }
    return out
  }

  if (raw && typeof raw === 'object') {
    for (const value of Object.values(raw as JsonRecord)) {
      const entity = normalizeEntity(value)
      if (entity) {
        out.push(entity)
      }
    }
  }

  return out
}

export class CollisionGrid {
  width: number

  height: number

  walkable: boolean[][]

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.walkable = Array.from({ length: height }, () => Array.from({ length: width }, () => true))
  }

  isWalkable(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return false
    }
    return this.walkable[y]![x] === true
  }

  getNeighbors(x: number, y: number, includeDiagonal = true): NavNode[] {
    const neighbors: NavNode[] = []

    if (this.isWalkable(x + 1, y)) {
      neighbors.push({ x: x + 1, y })
    }
    if (this.isWalkable(x - 1, y)) {
      neighbors.push({ x: x - 1, y })
    }
    if (this.isWalkable(x, y + 1)) {
      neighbors.push({ x, y: y + 1 })
    }
    if (this.isWalkable(x, y - 1)) {
      neighbors.push({ x, y: y - 1 })
    }

    if (includeDiagonal) {
      if (this.isWalkable(x + 1, y - 1) && this.isWalkable(x + 1, y) && this.isWalkable(x, y - 1)) {
        neighbors.push({ x: x + 1, y: y - 1 })
      }
      if (this.isWalkable(x - 1, y - 1) && this.isWalkable(x - 1, y) && this.isWalkable(x, y - 1)) {
        neighbors.push({ x: x - 1, y: y - 1 })
      }
      if (this.isWalkable(x + 1, y + 1) && this.isWalkable(x + 1, y) && this.isWalkable(x, y + 1)) {
        neighbors.push({ x: x + 1, y: y + 1 })
      }
      if (this.isWalkable(x - 1, y + 1) && this.isWalkable(x - 1, y) && this.isWalkable(x, y + 1)) {
        neighbors.push({ x: x - 1, y: y + 1 })
      }
    }

    return neighbors
  }
}

export class AStarPathfinder {
  static findPath(
    collisionGrid: CollisionGrid,
    start: NavNode,
    goal: NavNode,
    allowDiagonal = true,
    movementCostForStep?: (from: NavNode, to: NavNode) => number,
  ): NavNode[] {
    if (start.x === goal.x && start.y === goal.y) {
      return [start]
    }

    if (!collisionGrid.isWalkable(start.x, start.y) || !collisionGrid.isWalkable(goal.x, goal.y)) {
      return []
    }

    const openSet: Array<{ f: number; tie: number; node: NavNode }> = [{ f: 0, tie: 0, node: start }]
    const openHash = new Set<string>([keyOf(start)])
    const cameFrom = new Map<string, NavNode>()
    const gScore = new Map<string, number>([[keyOf(start), 0]])
    const fScore = new Map<string, number>([[keyOf(start), this.heuristic(start, goal)]])

    let tieBreaker = 0

    while (openSet.length > 0) {
      openSet.sort((a, b) => (a.f - b.f) || (a.tie - b.tie))
      const currentEntry = openSet.shift()!
      const current = currentEntry.node
      openHash.delete(keyOf(current))

      if (current.x === goal.x && current.y === goal.y) {
        return this.reconstructPath(cameFrom, current)
      }

      const neighbors = collisionGrid.getNeighbors(current.x, current.y, allowDiagonal)
      for (const neighbor of neighbors) {
        const currentKey = keyOf(current)
        const neighborKey = keyOf(neighbor)
        const stepCost = movementCostForStep ? movementCostForStep(current, neighbor) : 1
        const tentativeG = (gScore.get(currentKey) ?? Number.POSITIVE_INFINITY) + Math.max(1, stepCost)

        if (tentativeG < (gScore.get(neighborKey) ?? Number.POSITIVE_INFINITY)) {
          cameFrom.set(neighborKey, current)
          gScore.set(neighborKey, tentativeG)
          const neighborF = tentativeG + this.heuristic(neighbor, goal)
          fScore.set(neighborKey, neighborF)

          if (!openHash.has(neighborKey)) {
            tieBreaker += 1
            openSet.push({ f: neighborF, tie: tieBreaker, node: neighbor })
            openHash.add(neighborKey)
          }
        }
      }
    }

    return []
  }

  static pathDistance(path: NavNode[]): number {
    if (path.length <= 1) {
      return 0
    }
    return (path.length - 1) * 5
  }

  private static heuristic(node: NavNode, goal: NavNode): number {
    return Math.abs(node.x - goal.x) + Math.abs(node.y - goal.y)
  }

  private static reconstructPath(cameFrom: Map<string, NavNode>, current: NavNode): NavNode[] {
    const path: NavNode[] = [current]
    let cursor = current

    while (cameFrom.has(keyOf(cursor))) {
      cursor = cameFrom.get(keyOf(cursor))!
      path.push(cursor)
    }

    path.reverse()
    return path
  }
}

export function validateMoveRequest(params: {
  map: JsonRecord | null
  entityId: string
  targetX: number
  targetY: number
  checkMovementPool?: boolean
}): MovementValidationResult {
  const dimensions = normalizeMapDimensions(params.map)
  if (!dimensions) {
    return { valid: false, error: 'No map loaded', path: null, distance_feet: null }
  }

  const entities = normalizeMapEntities(params.map)
  const entity = entities.find((entry) => entry.id === params.entityId)
  if (!entity) {
    return { valid: false, error: `Entity ${params.entityId} not found`, path: null, distance_feet: null }
  }

  const { targetX, targetY } = params
  if (targetX < 0 || targetY < 0 || targetX >= dimensions.width || targetY >= dimensions.height) {
    return { valid: false, error: 'Target out of bounds', path: null, distance_feet: null }
  }

  const destinationOccupied = entities.some((entry) => {
    if (entry.id === params.entityId) {
      return false
    }
    return entry.x === targetX && entry.y === targetY
  })
  if (destinationOccupied) {
    return { valid: false, error: 'Destination tile is occupied', path: null, distance_feet: null }
  }

  const grid = new CollisionGrid(dimensions.width, dimensions.height)
  const mapMode = resolveMapModeForMovement(params.map)
  const traversalGrid = getTraversalGridFromMap(params.map)

  if (!traversalGrid) {
    return {
      valid: false,
      error: mapMode === 'ai_generated_image'
        ? 'Traversal grid is required for AI-generated maps and is not available yet'
        : 'Traversal grid is required for gameplay maps and is not available yet',
      path: null,
      distance_feet: null,
    }
  }

  grid.walkable = buildWalkableMatrixFromTraversalGrid(traversalGrid, dimensions.width, dimensions.height)

  if (!grid.isWalkable(targetX, targetY)) {
    return { valid: false, error: 'Target tile is not walkable', path: null, distance_feet: null }
  }

  const start = { x: entity.x, y: entity.y }
  const goal = { x: targetX, y: targetY }
  const path = AStarPathfinder.findPath(
    grid,
    start,
    goal,
    true,
    (_from, to) => movementCostMultiplierForMapTileFromTraversalGrid(
      traversalGrid,
      to.x,
      to.y,
      dimensions.width,
      dimensions.height,
    ),
  )

  if (path.length === 0) {
    return { valid: false, error: 'No path to target', path: null, distance_feet: null }
  }

  const distanceFeet = Math.round(calculateTraversalPathWorldCostFromMapPath(traversalGrid, path, dimensions.width, dimensions.height))
  return {
    valid: true,
    error: null,
    path,
    distance_feet: distanceFeet,
  }
}
