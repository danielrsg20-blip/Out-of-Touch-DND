import type { FrontendTraversalGrid, GridOverlayMode, Overlay } from '../../../frontend/src/types'
import type { GenerateVectorMapApiRequest, GenerateVectorMapApiResponse } from '../../../ts-runtime/src/lib/vectorMap/apiContract'
import {
  DEFAULT_VECTOR_MAP_PRESET_ID,
  VECTOR_MAP_PRESETS,
  getVectorMapPresetById,
  type VectorMapPresetId,
} from '../../../ts-runtime/src/lib/vectorMap/presetCatalog'
import { VectorMapViewer, type ViewerSummary } from './viewer'

type SizeOption = {
  id: 'small' | 'medium' | 'large'
  label: string
  widthWorld: number
  heightWorld: number
  helper: string
}

type ViewerControlsState = {
  runtimeUrl: string
  seedInput: string
  presetId: VectorMapPresetId
  sizeId: SizeOption['id']
  resolutionScale: 1 | 2
  maxSaturation: number
  showGrid: boolean
  gridMode: GridOverlayMode
}

const STORAGE_KEY = 'vector-map-viewer-state'
const DEFAULT_RUNTIME_URL = 'http://127.0.0.1:9020'
const DEFAULT_SEED = '123'
const SIZE_OPTIONS: readonly SizeOption[] = [
  { id: 'small', label: 'Small Skirmish', widthWorld: 100, heightWorld: 75, helper: '100 x 75 world units' },
  { id: 'medium', label: 'Medium Encounter', widthWorld: 160, heightWorld: 120, helper: '160 x 120 world units' },
  { id: 'large', label: 'Large Set Piece', widthWorld: 200, heightWorld: 150, helper: '200 x 150 world units' },
] as const

function defaultState(): ViewerControlsState {
  return {
    runtimeUrl: DEFAULT_RUNTIME_URL,
    seedInput: DEFAULT_SEED,
    presetId: DEFAULT_VECTOR_MAP_PRESET_ID,
    sizeId: 'small',
    resolutionScale: 2,
    maxSaturation: 0.65,
    showGrid: true,
    gridMode: 'outlines',
  }
}

function safeParseState(): Partial<ViewerControlsState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Partial<ViewerControlsState>) : {}
  } catch {
    return {}
  }
}

function readInitialState(): ViewerControlsState {
  const persisted = safeParseState()
  const params = new URLSearchParams(window.location.search)
  const base = { ...defaultState(), ...persisted }
  const maybePreset = params.get('preset') as VectorMapPresetId | null
  const maybeSize = params.get('size') as SizeOption['id'] | null
  const maybeResolution = Number(params.get('resolution'))
  const maybeShowGrid = params.get('showGrid')
  const maybeGridMode = params.get('gridMode') as GridOverlayMode | null
  const maybeMaxSat = Number(params.get('maxSat'))

  return {
    runtimeUrl: params.get('runtime') ?? base.runtimeUrl,
    seedInput: params.get('seed') ?? base.seedInput,
    presetId: VECTOR_MAP_PRESETS.some((preset) => preset.id === maybePreset) ? maybePreset! : base.presetId,
    sizeId: SIZE_OPTIONS.some((size) => size.id === maybeSize) ? maybeSize! : base.sizeId,
    resolutionScale: maybeResolution === 1 ? 1 : maybeResolution === 2 ? 2 : base.resolutionScale,
    maxSaturation: Number.isFinite(maybeMaxSat) && maybeMaxSat > 0 ? maybeMaxSat : base.maxSaturation,
    showGrid: maybeShowGrid == null ? base.showGrid : maybeShowGrid === '1',
    gridMode:
      maybeGridMode === 'blocked' || maybeGridMode === 'movement_cost' || maybeGridMode === 'tags' || maybeGridMode === 'outlines'
        ? maybeGridMode
        : base.gridMode,
  }
}

function persistState(state: ViewerControlsState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  const params = new URLSearchParams(window.location.search)
  params.set('runtime', state.runtimeUrl)
  params.set('seed', state.seedInput)
  params.set('preset', state.presetId)
  params.set('size', state.sizeId)
  params.set('resolution', String(state.resolutionScale))
  params.set('showGrid', state.showGrid ? '1' : '0')
  params.set('gridMode', state.gridMode)
  params.set('maxSat', state.maxSaturation.toFixed(2))
  window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`)
}

function panelSection(title: string): HTMLDivElement {
  const section = document.createElement('div')
  section.style.display = 'grid'
  section.style.gap = '10px'

  const heading = document.createElement('div')
  heading.textContent = title
  heading.style.font = '600 12px/1.2 "Segoe UI", sans-serif'
  heading.style.letterSpacing = '0.12em'
  heading.style.textTransform = 'uppercase'
  heading.style.color = '#8ea2c1'
  section.append(heading)

  return section
}

function label(text: string): HTMLLabelElement {
  const element = document.createElement('label')
  element.textContent = text
  element.style.display = 'grid'
  element.style.gap = '6px'
  element.style.font = '12px/1.4 monospace'
  element.style.color = '#d8e1ef'
  return element
}

function textInput(placeholder: string): HTMLInputElement {
  const input = document.createElement('input')
  input.type = 'text'
  input.placeholder = placeholder
  input.style.width = '100%'
  input.style.boxSizing = 'border-box'
  input.style.padding = '10px 12px'
  input.style.border = '1px solid #33425d'
  input.style.borderRadius = '10px'
  input.style.background = '#0d1320'
  input.style.color = '#eef4ff'
  input.style.font = '12px/1.4 monospace'
  return input
}

function button(text: string): HTMLButtonElement {
  const element = document.createElement('button')
  element.textContent = text
  element.style.padding = '10px 12px'
  element.style.border = '1px solid #3a5277'
  element.style.borderRadius = '10px'
  element.style.background = '#17304d'
  element.style.color = '#eef4ff'
  element.style.font = '600 12px/1 sans-serif'
  element.style.cursor = 'pointer'
  return element
}

function select(): HTMLSelectElement {
  const element = document.createElement('select')
  element.style.padding = '10px 12px'
  element.style.borderRadius = '10px'
  element.style.border = '1px solid #33425d'
  element.style.background = '#0d1320'
  element.style.color = '#eef4ff'
  element.style.font = '12px/1.4 monospace'
  return element
}

function copyButton(text = 'Copy'): HTMLButtonElement {
  const element = button(text)
  element.style.background = '#10263d'
  return element
}

function checkbox(text: string, checked: boolean): { wrapper: HTMLLabelElement; input: HTMLInputElement } {
  const wrapper = document.createElement('label')
  wrapper.style.display = 'flex'
  wrapper.style.alignItems = 'center'
  wrapper.style.gap = '8px'
  wrapper.style.font = '12px/1.4 monospace'
  wrapper.style.color = '#d8e1ef'

  const input = document.createElement('input')
  input.type = 'checkbox'
  input.checked = checked
  wrapper.append(input, document.createTextNode(text))
  return { wrapper, input }
}

function fileInput(accept: string): HTMLInputElement {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = accept
  input.style.color = '#d8e1ef'
  input.style.font = '12px/1.4 monospace'
  return input
}

function isGenerateVectorMapResponse(value: unknown): value is GenerateVectorMapApiResponse {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  return 'overlay' in record && 'traversal_grid' in record && 'reports' in record
}

export function createControls(viewer: VectorMapViewer): HTMLElement {
  const state = readInitialState()
  const panel = document.createElement('aside')
  panel.style.display = 'grid'
  panel.style.gap = '16px'
  panel.style.padding = '18px'
  panel.style.background = 'linear-gradient(180deg, #111827 0%, #0b1020 100%)'
  panel.style.borderRight = '1px solid #22314a'
  panel.style.overflow = 'auto'

  const title = document.createElement('div')
  title.innerHTML = '<div style="font:700 18px/1.1 Georgia, serif;color:#f5e9c9">Vector Map Viewer</div><div style="margin-top:6px;font:12px/1.4 monospace;color:#8ea2c1">Backend-driven harness for generate_vector_map overlays and traversal grids</div>'
  panel.append(title)

  const status = document.createElement('pre')
  status.style.margin = '0'
  status.style.padding = '12px'
  status.style.border = '1px solid #2c3a55'
  status.style.borderRadius = '12px'
  status.style.background = '#0a0f19'
  status.style.color = '#d8e1ef'
  status.style.font = '12px/1.5 monospace'
  status.textContent = 'No map loaded.'

  const validation = document.createElement('pre')
  validation.style.margin = '0'
  validation.style.padding = '12px'
  validation.style.border = '1px solid #2c3a55'
  validation.style.borderRadius = '12px'
  validation.style.background = '#09111d'
  validation.style.color = '#d8e1ef'
  validation.style.font = '12px/1.5 monospace'
  validation.textContent = 'Validation summary will appear after generation.'

  const generateSection = panelSection('Generate')
  const runtimeLabel = label('Runtime API URL')
  const runtimeInput = textInput(DEFAULT_RUNTIME_URL)
  runtimeInput.value = state.runtimeUrl
  runtimeLabel.append(runtimeInput)

  const presetLabel = label('Map Type')
  const presetSelect = select()
  const presetGroups = new Map<string, HTMLOptGroupElement>()
  for (const preset of VECTOR_MAP_PRESETS) {
    let group = presetGroups.get(preset.groupLabel)
    if (!group) {
      group = document.createElement('optgroup')
      group.label = preset.groupLabel
      presetGroups.set(preset.groupLabel, group)
      presetSelect.append(group)
    }
    const option = document.createElement('option')
    option.value = preset.id
    option.textContent = preset.label
    group.append(option)
  }
  presetSelect.value = state.presetId
  presetLabel.append(presetSelect)

  const presetDescription = document.createElement('div')
  presetDescription.style.padding = '12px'
  presetDescription.style.border = '1px solid #31415b'
  presetDescription.style.borderRadius = '12px'
  presetDescription.style.background = 'rgba(17, 32, 52, 0.75)'
  presetDescription.style.color = '#d8e1ef'
  presetDescription.style.font = '12px/1.5 monospace'

  const seedLabel = label('Seed')
  const seedRow = document.createElement('div')
  seedRow.style.display = 'grid'
  seedRow.style.gridTemplateColumns = 'minmax(0, 1fr) auto auto'
  seedRow.style.gap = '8px'
  const seedInput = textInput('123')
  seedInput.value = state.seedInput
  const randomButton = button('Generate Random Map')
  const copySeed = copyButton('Copy Seed')
  seedRow.append(seedInput, randomButton, copySeed)
  seedLabel.append(seedRow)

  const sizeLabel = label('Map Size')
  const sizeSelect = select()
  for (const option of SIZE_OPTIONS) {
    const element = document.createElement('option')
    element.value = option.id
    element.textContent = `${option.label} (${option.helper})`
    sizeSelect.append(element)
  }
  sizeSelect.value = state.sizeId
  sizeLabel.append(sizeSelect)

  const resolutionLabel = label('Grid Resolution')
  const resolutionSelect = select()
  ;[
    { value: '1', label: '1x authority grid' },
    { value: '2', label: '2x doubled debug grid' },
  ].forEach((option) => {
    const element = document.createElement('option')
    element.value = option.value
    element.textContent = option.label
    resolutionSelect.append(element)
  })
  resolutionSelect.value = String(state.resolutionScale)
  resolutionLabel.append(resolutionSelect)

  const saturationLabel = label('Max Saturation Clamp')
  const saturationInput = document.createElement('input')
  saturationInput.type = 'range'
  saturationInput.min = '0.35'
  saturationInput.max = '0.80'
  saturationInput.step = '0.05'
  saturationInput.value = state.maxSaturation.toFixed(2)
  const saturationValue = document.createElement('div')
  saturationValue.style.font = '12px/1.4 monospace'
  saturationValue.style.color = '#8ea2c1'
  saturationLabel.append(saturationInput, saturationValue)

  const generateButton = button('Generate')
  generateButton.style.width = '100%'
  const generationError = document.createElement('div')
  generationError.style.minHeight = '18px'
  generationError.style.color = '#f4a6a6'
  generationError.style.font = '12px/1.4 monospace'

  generateSection.append(
    runtimeLabel,
    presetLabel,
    presetDescription,
    seedLabel,
    sizeLabel,
    resolutionLabel,
    saturationLabel,
    generateButton,
    generationError,
  )

  const urlSection = panelSection('Load From URLs')
  const overlayUrl = textInput('/tmp/vector-output/seed-123/overlay.json')
  const gridUrl = textInput('/tmp/vector-output/seed-123/traversal_grid.json')
  const loadUrlsButton = button('Load URLs')
  const urlError = document.createElement('div')
  urlError.style.minHeight = '18px'
  urlError.style.color = '#f4a6a6'
  urlError.style.font = '12px/1.4 monospace'
  const overlayUrlLabel = label('Overlay URL')
  overlayUrlLabel.append(overlayUrl)
  const gridUrlLabel = label('Grid URL')
  gridUrlLabel.append(gridUrl)
  urlSection.append(overlayUrlLabel, gridUrlLabel, loadUrlsButton, urlError)

  const fileSection = panelSection('Load From Files')
  const overlayFile = fileInput('.json')
  const gridFile = fileInput('.json')
  const loadFilesButton = button('Load Files')
  const overlayFileLabel = label('Overlay file')
  overlayFileLabel.append(overlayFile)
  const gridFileLabel = label('Grid file')
  gridFileLabel.append(gridFile)
  fileSection.append(overlayFileLabel, gridFileLabel, loadFilesButton)

  const viewSection = panelSection('View')
  const fitButton = button('Fit To View')
  const gridVisible = checkbox('Show Grid Overlay', state.showGrid)
  const labelsVisible = checkbox('Show labels', true)
  const dmLabelsVisible = checkbox('Show DM-only labels', false)
  const modeLabel = label('Grid mode')
  const modeSelect = select()
  ;([
    ['outlines', 'outlines'],
    ['blocked', 'blocked'],
    ['movement_cost', 'cost heatmap'],
    ['tags', 'tags'],
  ] as Array<[GridOverlayMode, string]>).forEach(([mode, labelText]) => {
    const option = document.createElement('option')
    option.value = mode
    option.textContent = labelText
    modeSelect.append(option)
  })
  modeSelect.value = state.gridMode
  modeLabel.append(modeSelect)

  const opacityLabel = label('Grid opacity')
  const opacityInput = document.createElement('input')
  opacityInput.type = 'range'
  opacityInput.min = '0'
  opacityInput.max = '1'
  opacityInput.step = '0.05'
  opacityInput.value = '0.55'
  opacityLabel.append(opacityInput)
  viewSection.append(fitButton, gridVisible.wrapper, labelsVisible.wrapper, dmLabelsVisible.wrapper, modeLabel, opacityLabel)

  panel.append(generateSection, viewSection, status, validation, urlSection, fileSection)

  function updatePresetDescription(): void {
    const preset = getVectorMapPresetById(presetSelect.value)
    presetDescription.textContent = preset.description
  }

  function updateSaturationLabel(): void {
    saturationValue.textContent = `Current clamp: ${Number(saturationInput.value).toFixed(2)}`
  }

  function currentSize(): SizeOption {
    return SIZE_OPTIONS.find((option) => option.id === sizeSelect.value) ?? SIZE_OPTIONS[0]!
  }

  function collectState(): ViewerControlsState {
    return {
      runtimeUrl: runtimeInput.value.trim() || DEFAULT_RUNTIME_URL,
      seedInput: seedInput.value.trim() || DEFAULT_SEED,
      presetId: (presetSelect.value as VectorMapPresetId) || DEFAULT_VECTOR_MAP_PRESET_ID,
      sizeId: (sizeSelect.value as SizeOption['id']) || 'small',
      resolutionScale: Number(resolutionSelect.value) === 1 ? 1 : 2,
      maxSaturation: Number(saturationInput.value),
      showGrid: gridVisible.input.checked,
      gridMode: modeSelect.value as GridOverlayMode,
    }
  }

  function renderValidation(response: GenerateVectorMapApiResponse): void {
    const payload = response.reports.payload_validation
    const grid = response.reports.grid_validation
    const color = response.reports.color_validation
    validation.textContent = [
      `seed used:               ${String(response.overlay.metadata?.seed ?? seedInput.value)}`,
      `preset id:               ${String(response.overlay.metadata?.preset_id ?? presetSelect.value)}`,
      `polygon closure fixes:   ${payload.fixed_geometries}`,
      `out-of-bounds clamped:   ${payload.out_of_bounds_clamped}`,
      `rejected elements:       ${payload.rejected_elements}`,
      `duplicate ids:           ${payload.duplicate_ids}`,
      `unknown blocking tags:   ${grid.unknown_blocking_tags.length > 0 ? grid.unknown_blocking_tags.join(', ') : '(none)'}`,
      `blocked-tag mismatches:  ${grid.blocked_tag_mismatch_count}`,
      `colors clamped:          ${color.elements_with_colors_clamped} / ${color.elements_total}`,
      `invalid colors rejected: ${color.out_of_bounds_rejected}`,
      `overlay hash:            ${response.hashes.overlay_hash}`,
      `grid hash:               ${response.hashes.grid_hash}`,
    ].join('\n')
  }

  async function generateMap(nextSeed?: string): Promise<void> {
    generationError.textContent = ''
    generateButton.disabled = true
    randomButton.disabled = true
    loadUrlsButton.disabled = true
    loadFilesButton.disabled = true
    generateButton.textContent = 'Generating...'

    if (nextSeed) {
      seedInput.value = nextSeed
    }

    const current = collectState()
    persistState(current)

    const size = currentSize()
    const preset = getVectorMapPresetById(current.presetId)
    const request: GenerateVectorMapApiRequest = {
      seed: seedInput.value.trim(),
      preset_id: current.presetId,
      name: preset.label,
      bounds_world: {
        origin_x: 0,
        origin_y: 0,
        width_world: size.widthWorld,
        height_world: size.heightWorld,
      },
      grid_config: {
        base_cell_size_world: 5,
        resolution_scale: current.resolutionScale,
        diagonal_policy: 'allow',
      },
      validation_mode: 'fixup',
      style_options: {
        style_preset: preset.stylePreset,
        max_saturation: current.maxSaturation,
        allow_magic_glow: false,
      },
    }

    try {
      const response = await fetch(`${current.runtimeUrl.replace(/\/$/, '')}/api/tools/generate_vector_map`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
      const payload = (await response.json()) as GenerateVectorMapApiResponse | { error?: string }
      if (!response.ok || (!isGenerateVectorMapResponse(payload) && typeof payload.error === 'string')) {
        throw new Error(!isGenerateVectorMapResponse(payload) && payload.error ? payload.error : `Request failed with ${response.status}`)
      }
      if (!isGenerateVectorMapResponse(payload)) {
        throw new Error('Runtime returned an unexpected generate_vector_map payload.')
      }
      viewer.setData(payload.overlay as unknown as Overlay, payload.traversal_grid as unknown as FrontendTraversalGrid)
      seedInput.value = String(payload.overlay.metadata?.seed ?? seedInput.value)
      renderValidation(payload)
      persistState(collectState())
    } catch (error) {
      generationError.textContent = error instanceof Error ? error.message : String(error)
    } finally {
      generateButton.disabled = false
      randomButton.disabled = false
      loadUrlsButton.disabled = false
      loadFilesButton.disabled = false
      generateButton.textContent = 'Generate'
    }
  }

  async function loadFromUrls(): Promise<void> {
    urlError.textContent = ''
    if (!overlayUrl.value.trim()) {
      urlError.textContent = 'Overlay URL is required.'
      return
    }
    try {
      await viewer.loadFromUrls(overlayUrl.value.trim(), gridUrl.value.trim() || undefined)
      const params = new URLSearchParams(window.location.search)
      params.set('overlay', overlayUrl.value.trim())
      if (gridUrl.value.trim()) {
        params.set('grid', gridUrl.value.trim())
      } else {
        params.delete('grid')
      }
      window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`)
    } catch (error) {
      urlError.textContent = error instanceof Error ? error.message : String(error)
    }
  }

  function nextRandomSeed(): string {
    const values = new Uint32Array(1)
    crypto.getRandomValues(values)
    const normalized = Math.max(1, values[0] % 2147483647)
    return String(normalized)
  }

  loadUrlsButton.addEventListener('click', () => {
    void loadFromUrls()
  })
  loadFilesButton.addEventListener('click', () => {
    const selectedOverlay = overlayFile.files?.[0]
    const selectedGrid = gridFile.files?.[0] ?? null
    if (!selectedOverlay) {
      urlError.textContent = 'Choose an overlay file first.'
      return
    }
    void viewer.loadFromFiles(selectedOverlay, selectedGrid).catch((error) => {
      urlError.textContent = error instanceof Error ? error.message : String(error)
    })
  })
  generateButton.addEventListener('click', () => {
    void generateMap()
  })
  randomButton.addEventListener('click', () => {
    void generateMap(nextRandomSeed())
  })
  presetSelect.addEventListener('change', () => {
    updatePresetDescription()
    persistState(collectState())
    void generateMap()
  })
  seedInput.addEventListener('change', () => persistState(collectState()))
  runtimeInput.addEventListener('change', () => persistState(collectState()))
  sizeSelect.addEventListener('change', () => {
    persistState(collectState())
    void generateMap()
  })
  resolutionSelect.addEventListener('change', () => {
    persistState(collectState())
    void generateMap()
  })
  saturationInput.addEventListener('input', () => {
    updateSaturationLabel()
    persistState(collectState())
  })
  saturationInput.addEventListener('change', () => {
    void generateMap()
  })
  copySeed.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(seedInput.value)
      copySeed.textContent = 'Copied'
      window.setTimeout(() => {
        copySeed.textContent = 'Copy Seed'
      }, 1200)
    } catch {
      generationError.textContent = 'Clipboard write failed.'
    }
  })
  fitButton.addEventListener('click', viewer.fitToView)
  gridVisible.input.addEventListener('change', () => {
    viewer.setGridVisible(gridVisible.input.checked)
    persistState(collectState())
  })
  labelsVisible.input.addEventListener('change', () => viewer.setShowLabels(labelsVisible.input.checked))
  dmLabelsVisible.input.addEventListener('change', () => viewer.setShowDmOnlyLabels(dmLabelsVisible.input.checked))
  modeSelect.addEventListener('change', () => {
    viewer.setGridMode(modeSelect.value as GridOverlayMode)
    persistState(collectState())
  })
  opacityInput.addEventListener('input', () => viewer.setGridOpacity(Number(opacityInput.value)))

  viewer.setGridVisible(state.showGrid)
  viewer.setGridMode(state.gridMode)

  viewer.setOnChange((summary: ViewerSummary) => {
    status.textContent = [
      `overlay: ${summary.overlayLoaded ? 'loaded' : 'missing'}`,
      `grid:    ${summary.gridLoaded ? 'loaded' : 'missing'}`,
      `layers:  ${summary.layers}`,
      `elements:${summary.elements}`,
      `cells:   ${summary.cells}`,
      `blocked: ${summary.blockedPercent.toFixed(1)}%`,
      `bounds:  ${summary.worldWidth} x ${summary.worldHeight}`,
      `zoom:    ${summary.zoom.toFixed(2)}x`,
    ].join('\n')
  })

  const params = new URLSearchParams(window.location.search)
  const initialOverlay = params.get('overlay')
  const initialGrid = params.get('grid')
  if (initialOverlay) {
    overlayUrl.value = initialOverlay
  }
  if (initialGrid) {
    gridUrl.value = initialGrid
  }
  updatePresetDescription()
  updateSaturationLabel()
  if (initialOverlay) {
    void loadFromUrls()
  } else {
    void generateMap()
  }

  return panel
}