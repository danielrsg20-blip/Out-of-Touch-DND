/**
 * VectorOverlayTester.tsx
 *
 * Simple test UI component for loading and testing vector overlays during development.
 * Provides buttons to load hardcoded test overlays and inspect their state.
 * 
 * Integration: Import and include in a dev panel or test page.
 */

import { useVectorOverlay } from '../hooks/useVectorOverlay'
import { getAllTestOverlays } from '../data/overlayTestData'
import { useState } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import { useGameStore } from '../stores/gameStore'
import './VectorOverlayTester.css'

export function VectorOverlayTester() {
  const {
    overlay,
    loadOverlay,
    undo,
    redo,
    canUndo,
    canRedo,
    saveOverlay,
    exportAsSVG,
    setLayerVisibility,
    createOverlayRemote,
    fetchOverlayRemote,
    generateFromNarrativeRemote,
  } = useVectorOverlay()
  const roomCode = useSessionStore((s) => s.roomCode)
  const map = useGameStore((s) => s.map)
  const [storyPrompt, setStoryPrompt] = useState('recent battle in a cursed forest with scorch marks and dark fog')

  const testOverlays = getAllTestOverlays()

  return (
    <div className="vector-overlay-tester">
      <h3>Vector Overlay Tester (Phase 1)</h3>

      <div className="controls">
        <div className="button-group">
          <h4>Load Test Overlays</h4>
          {testOverlays.map((testOverlay) => (
            <button
              key={testOverlay.id}
              onClick={() => loadOverlay(testOverlay)}
              className="btn btn-small"
            >
              Load: {testOverlay.name}
            </button>
          ))}
        </div>

        <div className="button-group">
          <h4>Backend Sync</h4>
          <button
            onClick={() => createOverlayRemote('overlay_debug_live', 'Overlay Debug Live')}
            className="btn btn-small"
          >
            Create Remote Overlay
          </button>
          <button
            onClick={() => fetchOverlayRemote('overlay_debug_live')}
            className="btn btn-small"
          >
            Fetch Remote Overlay
          </button>
        </div>

        <div className="button-group">
          <h4>AI GM Story Generate</h4>
          <textarea
            className="overlay-prompt"
            value={storyPrompt}
            onChange={(e) => setStoryPrompt(e.target.value)}
            placeholder="Describe the scene: cursed forest, winter storm, ancient temple, etc."
            rows={3}
          />
          <button
            onClick={() =>
              generateFromNarrativeRemote({
                narrative: storyPrompt,
                overlayId: 'overlay_debug_live',
                overlayName: 'Overlay Debug Live',
                roomCode: roomCode ?? undefined,
                mapWidth: map?.width,
                mapHeight: map?.height,
                replace: true,
              })
            }
            className="btn btn-small"
          >
            Generate From Story
          </button>
        </div>

        {overlay && (
          <>
            <div className="button-group">
              <h4>Edit</h4>
              <button onClick={undo} disabled={!canUndo} className="btn btn-small">
                ↶ Undo
              </button>
              <button onClick={redo} disabled={!canRedo} className="btn btn-small">
                ↷ Redo
              </button>
            </div>

            <div className="button-group">
              <h4>Export/Save</h4>
              <button onClick={() => saveOverlay()} className="btn btn-small">
                💾 Save JSON
              </button>
              <button onClick={() => exportAsSVG(1024, 1024)} className="btn btn-small">
                🎨 Export SVG
              </button>
            </div>

            <div className="layers-panel">
              <h4>Layers ({overlay.layers.length})</h4>
              {overlay.layers.map((layer) => (
                <div key={layer.id} className="layer-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={layer.visible}
                      onChange={(e) => setLayerVisibility(layer.id, e.target.checked)}
                    />
                    <span className="layer-name">{layer.name}</span>
                  </label>
                  <span className="layer-meta">
                    z={layer.z_index} • {layer.elements.length} elem • {layer.blend_mode}
                  </span>
                </div>
              ))}
            </div>

            <div className="info-panel">
              <h4>Overlay Info</h4>
              <p>
                <strong>ID:</strong> {overlay.id}
              </p>
              <p>
                <strong>Name:</strong> {overlay.name}
              </p>
              <p>
                <strong>Layers:</strong> {overlay.layers.length}
              </p>
              <p>
                <strong>Total Elements:</strong> {overlay.layers.reduce((sum, l) => sum + l.elements.length, 0)}
              </p>
              {overlay.metadata?.story_context && (
                <p>
                  <strong>Story:</strong> {overlay.metadata.story_context}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default VectorOverlayTester
