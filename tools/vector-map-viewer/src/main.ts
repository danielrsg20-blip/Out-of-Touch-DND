import { createControls } from './controls'
import { VectorMapViewer } from './viewer'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) {
  throw new Error('Expected #app root element')
}
const root = app

document.body.style.margin = '0'
document.body.style.background = '#07111c'
document.body.style.color = '#eef4ff'

root.style.display = 'grid'
root.style.gridTemplateColumns = '360px minmax(0, 1fr)'
root.style.height = '100vh'

const sidebar = document.createElement('div')
const stage = document.createElement('div')
stage.style.minWidth = '0'
stage.style.minHeight = '0'
stage.style.position = 'relative'

const stageHeader = document.createElement('div')
stageHeader.textContent = 'Wheel to zoom. Drag to pan. Generate from the TS runtime or preload overlay/grid JSON via URL params.'
stageHeader.style.position = 'absolute'
stageHeader.style.left = '16px'
stageHeader.style.top = '16px'
stageHeader.style.zIndex = '2'
stageHeader.style.padding = '10px 12px'
stageHeader.style.border = '1px solid rgba(255,255,255,0.1)'
stageHeader.style.borderRadius = '999px'
stageHeader.style.background = 'rgba(7, 17, 28, 0.72)'
stageHeader.style.backdropFilter = 'blur(12px)'
stageHeader.style.font = '12px/1.4 monospace'
stageHeader.style.color = '#c4d2e7'

const stageCanvasHost = document.createElement('div')
stageCanvasHost.style.position = 'absolute'
stageCanvasHost.style.inset = '0'

stage.append(stageCanvasHost, stageHeader)
root.append(sidebar, stage)

const viewer = new VectorMapViewer(stageCanvasHost)
sidebar.append(createControls(viewer))

const media = window.matchMedia('(max-width: 980px)')
function syncLayout(): void {
  if (media.matches) {
    root.style.gridTemplateColumns = '1fr'
    root.style.gridTemplateRows = 'auto minmax(0, 1fr)'
    sidebar.style.maxHeight = '45vh'
  } else {
    root.style.gridTemplateColumns = '360px minmax(0, 1fr)'
    root.style.gridTemplateRows = '1fr'
    sidebar.style.maxHeight = 'none'
  }
}

media.addEventListener('change', syncLayout)
syncLayout()