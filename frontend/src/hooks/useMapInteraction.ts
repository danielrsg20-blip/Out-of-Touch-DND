import { useState, useCallback, useRef } from 'react'

const TILE_SIZE = 40

interface MapInteraction {
  offsetX: number
  offsetY: number
  zoom: number
  isPanning: boolean
  handleWheel: (e: WheelEvent) => void
  handlePointerDown: (e: React.PointerEvent) => void
  handlePointerMove: (e: React.PointerEvent) => void
  handlePointerUp: () => void
  screenToGrid: (screenX: number, screenY: number, canvasRect: DOMRect) => { gx: number; gy: number }
}

export function useMapInteraction(): MapInteraction {
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  const lastPos = useRef({ x: 0, y: 0 })

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom(z => Math.max(0.25, Math.min(4, z * delta)))
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      setIsPanning(true)
      lastPos.current = { x: e.clientX, y: e.clientY }
      e.currentTarget.setPointerCapture(e.pointerId)
    }
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (isPanning) {
      const dx = e.clientX - lastPos.current.x
      const dy = e.clientY - lastPos.current.y
      lastPos.current = { x: e.clientX, y: e.clientY }
      setOffsetX(ox => ox + dx)
      setOffsetY(oy => oy + dy)
    }
  }, [isPanning])

  const handlePointerUp = useCallback(() => {
    setIsPanning(false)
  }, [])

  const screenToGrid = useCallback((screenX: number, screenY: number, canvasRect: DOMRect) => {
    const canvasX = screenX - canvasRect.left
    const canvasY = screenY - canvasRect.top
    const worldX = (canvasX - offsetX) / zoom
    const worldY = (canvasY - offsetY) / zoom
    return {
      gx: Math.floor(worldX / TILE_SIZE),
      gy: Math.floor(worldY / TILE_SIZE),
    }
  }, [offsetX, offsetY, zoom])

  return { offsetX, offsetY, zoom, isPanning, handleWheel, handlePointerDown, handlePointerMove, handlePointerUp, screenToGrid }
}
