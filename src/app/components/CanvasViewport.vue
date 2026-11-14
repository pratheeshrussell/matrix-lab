<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Vec2 } from '../../domain/math/Vector2'
import { EDUCATIONAL_PRESETS } from '../../engine/educationalPresets'
import { ParticleFlowEngine } from '../../engine/FlowSimulation'
import { probeVectorFieldAt } from '../../engine/VectorFieldEvaluator'
import { JSXGraphRenderer } from '../../renderers/JSXGraphRenderer'
import { useSceneStore } from '../../stores/sceneStore'
import { useTransformationStore } from '../../stores/transformationStore'
import KatexMath from './KatexMath.vue'

const sceneStore = useSceneStore()
const transformStore = useTransformationStore()

const boardContainerRef = ref<HTMLElement | null>(null)
const renderer = new JSXGraphRenderer()
const flowEngine = new ParticleFlowEngine()
const showExperimentBanner = ref(true)
const isPlayingMorph = ref(false)
const isFlowPlaying = ref(false)
const isSeedMode = ref(false)
const hoverWorldPos = ref<Vec2 | null>(null)

let resizeObserver: ResizeObserver | null = null
let morphFrameId: number | null = null
let lastMorphFrameTime = 0
let flowFrameId: number | null = null
let lastFlowFrameTime = 0

const hasVisibleVectorField = computed(() =>
  sceneStore.vectorFields.some((f) => f.visible),
)

const activeVisibleField = computed(
  () =>
    sceneStore.vectorFields.find((f) => f.visible && f.id === sceneStore.selectedObjectId) ??
    sceneStore.vectorFields.find((f) => f.visible) ??
    null,
)

const activeHeatmapField = computed(
  () =>
    sceneStore.vectorFields.find((f) => f.visible && (f.colorOverlay ?? 'none') !== 'none') ??
    null,
)

const activeFieldProbe = computed(() => {
  if (!hoverWorldPos.value || !activeVisibleField.value) return null
  return probeVectorFieldAt(
    activeVisibleField.value,
    hoverWorldPos.value,
    transformStore.evaluatedScene.activeCompositeMatrix,
    transformStore.vectorFieldMode,
  )
})

const probeReadout = computed(() => {
  const p = activeFieldProbe.value
  if (!p) return null
  const isOrigOnly = transformStore.visualizationMode === 'original'
  const vec = isOrigOnly ? p.origVector : (p.transVector ?? p.origVector)
  const div = isOrigOnly ? p.origDivergence : (p.transDivergence ?? p.origDivergence)
  const curl = isOrigOnly ? p.origCurl : (p.transCurl ?? p.origCurl)
  const scalar = isOrigOnly ? p.origScalar : (p.transScalar ?? p.origScalar)
  return {
    x: formatProbeNum(p.position[0]),
    y: formatProbeNum(p.position[1]),
    vecLabel: isOrigOnly ? 'F' : p.transVector ? "F'" : 'F',
    vx: vec ? formatProbeNum(vec[0]) : '—',
    vy: vec ? formatProbeNum(vec[1]) : '—',
    divText: div !== null ? formatProbeNum(div) : '—',
    divTag: div !== null ? divStatusLabel(div) : '',
    curlText: curl !== null ? formatProbeNum(curl) : '—',
    curlTag: curl !== null ? curlStatusLabel(curl) : '',
    scalarText: p.inputMode === 'scalar-gradient' && scalar !== null ? formatProbeNum(scalar) : null,
  }
})

function formatProbeNum(val: number): string {
  if (Math.abs(val) < 1e-4) return '0'
  return val.toFixed(2)
}

function divStatusLabel(val: number): string {
  if (val > 0.05) return 'Source'
  if (val < -0.05) return 'Sink'
  return '0'
}

function curlStatusLabel(val: number): string {
  if (val > 0.05) return 'CCW'
  if (val < -0.05) return 'CW'
  return '0'
}

const activeExperiment = computed(() =>
  EDUCATIONAL_PRESETS.find((p) => p.id === transformStore.activeEducationalPresetId),
)

const singularFieldWarning = computed(() => {
  const field = transformStore.evaluatedScene.transformedFields.find(
    (f) => f.visible && f.singularPushforwardUnavailable,
  )
  return field?.singularExplanation ?? null
})

function stopMorphAnimation(): void {
  isPlayingMorph.value = false
  if (morphFrameId !== null) {
    cancelAnimationFrame(morphFrameId)
    morphFrameId = null
  }
}

function toggleMorphPlayback(): void {
  if (isPlayingMorph.value) {
    stopMorphAnimation()
    return
  }

  if (transformStore.enabledSteps.length === 0) return

  if (transformStore.visualizationMode === 'original') {
    transformStore.visualizationMode = 'overlay'
  }

  if (transformStore.morphT >= 0.999) {
    transformStore.setMorphT(0)
  }

  isPlayingMorph.value = true
  lastMorphFrameTime = performance.now()

  const tick = (now: number): void => {
    if (!isPlayingMorph.value) return
    const dtSeconds = Math.min(0.05, (now - lastMorphFrameTime) / 1000)
    lastMorphFrameTime = now

    const totalSteps = Math.max(1, transformStore.enabledSteps.length)
    const durationSeconds = 1.6 * totalSteps
    const nextT = transformStore.morphT + dtSeconds / durationSeconds

    if (nextT >= 1) {
      transformStore.setMorphT(1)
      stopMorphAnimation()
      return
    }

    transformStore.setMorphT(nextT)
    morphFrameId = requestAnimationFrame(tick)
  }

  morphFrameId = requestAnimationFrame(tick)
}

function syncFlowEngineFromScene(): void {
  const scene = transformStore.evaluatedScene
  flowEngine.sync(
    scene.fieldDefinitions,
    scene.activeCompositeMatrix,
    transformStore.vectorFieldMode,
    transformStore.customFlowSeeds,
  )
}

function renderCurrentFlowBatch(): void {
  if (!isFlowPlaying.value || !hasVisibleVectorField.value) {
    renderer.updateFlowParticles(null)
    return
  }
  const mode = transformStore.visualizationMode
  const showOrig = mode === 'original' || mode === 'overlay' || mode === 'step-through'
  const showTrans = mode === 'transformed' || mode === 'overlay' || mode === 'step-through'
  renderer.updateFlowParticles(flowEngine.buildRenderBatch(showOrig, showTrans))
}

function stopFlowAnimation(): void {
  isFlowPlaying.value = false
  if (flowFrameId !== null) {
    cancelAnimationFrame(flowFrameId)
    flowFrameId = null
  }
  renderer.updateFlowParticles(null)
}

function toggleFlowPlayback(): void {
  if (isFlowPlaying.value) {
    stopFlowAnimation()
    return
  }
  if (!hasVisibleVectorField.value) return

  syncFlowEngineFromScene()
  isFlowPlaying.value = true
  lastFlowFrameTime = performance.now()

  const tickFlow = (now: number): void => {
    if (!isFlowPlaying.value) return
    if (!hasVisibleVectorField.value) {
      stopFlowAnimation()
      return
    }
    const dtSeconds = Math.min(0.05, (now - lastFlowFrameTime) / 1000)
    lastFlowFrameTime = now
    flowEngine.advance(dtSeconds)
    renderCurrentFlowBatch()
    flowFrameId = requestAnimationFrame(tickFlow)
  }

  flowFrameId = requestAnimationFrame(tickFlow)
}

function setSeedMode(enabled: boolean): void {
  isSeedMode.value = enabled
  renderer.setSeedPlacementMode(enabled)
}

function toggleSeedMode(): void {
  if (!hasVisibleVectorField.value && !isSeedMode.value) return
  setSeedMode(!isSeedMode.value)
}

function handleWindowKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && isSeedMode.value) {
    setSeedMode(false)
  }
}

function handleMorphSliderInput(event: Event): void {
  stopMorphAnimation()
  if (transformStore.visualizationMode === 'original') {
    transformStore.visualizationMode = 'overlay'
  }
  const value = Number((event.target as HTMLInputElement).value)
  if (Number.isFinite(value)) {
    transformStore.setMorphT(value)
  }
}

onMounted(() => {
  if (!boardContainerRef.value) return
  renderer.initialize(boardContainerRef.value, undefined, {
    onBasisDrag: (which, pos) => {
      stopMorphAnimation()
      transformStore.setTransformedBasisColumn(which, pos)
    },
    onPointDrag: (objectId, pos) => {
      sceneStore.updatePointCoordinates(objectId, pos)
    },
    onVectorTipDrag: (objectId, tipPos) => {
      sceneStore.updateVectorTip(objectId, tipPos)
    },
    onCanvasSeedClick: (pos, keepMode) => {
      transformStore.addFlowSeed(pos)
      if (!transformStore.showStreamlines && !isFlowPlaying.value) {
        transformStore.showStreamlines = true
      }
      if (isSeedMode.value && !keepMode) {
        setSeedMode(false)
      }
    },
    onCanvasPointerMove: (pos) => {
      hoverWorldPos.value = pos
    },
  })
  window.addEventListener('keydown', handleWindowKeyDown)
  syncFlowEngineFromScene()
  renderer.render(transformStore.evaluatedScene)

  resizeObserver = new ResizeObserver(() => {
    renderer.resize()
    renderer.render(transformStore.evaluatedScene)
    renderCurrentFlowBatch()
  })
  resizeObserver.observe(boardContainerRef.value)
})

watch(
  () => transformStore.evaluatedScene,
  (newScene) => {
    syncFlowEngineFromScene()
    renderer.render(newScene)
    if (isFlowPlaying.value) {
      renderCurrentFlowBatch()
    }
  },
  { deep: true },
)

watch(hasVisibleVectorField, (visible) => {
  if (!visible && isSeedMode.value) {
    setSeedMode(false)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWindowKeyDown)
  stopMorphAnimation()
  stopFlowAnimation()
  resizeObserver?.disconnect()
  renderer.destroy()
})
</script>

<template>
  <main class="canvas-viewport">
    <!-- Morph Animation & Direct Drag Strip -->
    <div class="morph-bar">
      <div class="morph-controls">
        <button
          type="button"
          class="morph-play-btn"
          :disabled="transformStore.enabledSteps.length === 0"
          :title="isPlayingMorph ? 'Pause morph animation' : 'Animate transformation from I to M'"
          @click="toggleMorphPlayback"
        >
          {{ isPlayingMorph ? '⏸ Pause' : '▶ Morph' }}
        </button>

        <label class="morph-slider-wrap">
          <span class="morph-label">
            <KatexMath tex="t" /> = {{ transformStore.morphT.toFixed(2) }}
          </span>
          <input
            :value="transformStore.morphT"
            type="range"
            min="0"
            max="1"
            step="0.005"
            class="morph-slider"
            :disabled="transformStore.enabledSteps.length === 0"
            aria-label="Transformation morph progress"
            @input="handleMorphSliderInput"
          />
        </label>

        <button
          type="button"
          class="morph-snap-btn"
          :disabled="transformStore.enabledSteps.length === 0 || transformStore.morphT === 0"
          title="Jump to t = 0 (Identity)"
          @click="
            stopMorphAnimation();
            transformStore.setMorphT(0)
          "
        >
          0%
        </button>
        <button
          type="button"
          class="morph-snap-btn"
          :disabled="transformStore.enabledSteps.length === 0 || transformStore.morphT === 1"
          title="Jump to t = 1 (Full Transform)"
          @click="
            stopMorphAnimation();
            transformStore.setMorphT(1)
          "
        >
          100%
        </button>
      </div>

      <div class="flow-controls">
        <button
          type="button"
          class="flow-play-btn"
          :class="{ active: isFlowPlaying }"
          :disabled="!hasVisibleVectorField"
          :title="isFlowPlaying ? 'Pause vector field particle flow' : 'Animate particles flowing along the vector field (RK4)'"
          @click="toggleFlowPlayback"
        >
          {{ isFlowPlaying ? '⏸ Pause Flow' : '▶ Flow Particles' }}
        </button>

        <button
          type="button"
          class="seed-mode-btn"
          :class="{ active: isSeedMode }"
          :disabled="!hasVisibleVectorField && !isSeedMode"
          :title="
            isSeedMode
              ? 'Click empty canvas to drop a seed (hold Shift for multiple, Esc to cancel)'
              : 'Click canvas to drop a streamline & particle seed (or double-click anytime)'
          "
          @click="toggleSeedMode"
        >
          {{ isSeedMode ? '✕ Click Canvas (or Esc)' : '🎯 Drop Seed' }}
        </button>

        <button
          v-if="transformStore.customFlowSeeds.length > 0"
          type="button"
          class="morph-snap-btn"
          title="Remove custom user-dropped streamline seeds"
          @click="transformStore.clearFlowSeeds()"
        >
          Clear Seeds ({{ transformStore.customFlowSeeds.length }})
        </button>
      </div>

      <div class="drag-hint" title="Drag the circular handles directly on the coordinate plane">
        Drag <span class="hint-e1">A·e₁</span>, <span class="hint-e2">A·e₂</span>, points, or vector tips
        <span class="hint-sub">(Double-click = drop seed)</span>
      </div>
    </div>

    <div class="board-stage">
      <!-- Educational Experiment Insight Banner -->
      <div v-if="activeExperiment && showExperimentBanner" class="experiment-banner">
        <div class="exp-content">
          <span class="exp-tag">Active Experiment</span>
          <strong>{{ activeExperiment.question }}</strong>
          <p>{{ activeExperiment.explanation }}</p>
        </div>
        <button
          type="button"
          class="dismiss-btn"
          title="Hide banner"
          @click="showExperimentBanner = false"
        >
          ✕
        </button>
      </div>

      <!-- Singular Pushforward Alert Overlay -->
      <div v-if="singularFieldWarning" class="singular-overlay-alert" role="status">
        <strong>Singular Matrix Vector-Field Notice:</strong> {{ singularFieldWarning }}
        <div class="singular-actions">
          <button
            type="button"
            class="alert-action-btn"
            @click="transformStore.vectorFieldMode = 'fixed-samples'"
          >
            Switch to Mode A: Fixed-Sample Values <KatexMath tex="A\mathbf{F}(\mathbf{x})" />
          </button>
          <button
            v-if="transformStore.pushforwardStyle !== 'mapped-sample-points'"
            type="button"
            class="alert-action-btn"
            @click="transformStore.pushforwardStyle = 'mapped-sample-points'"
          >
            Preview Forward-Collapsed Samples <KatexMath tex="\mathbf{x}' = A\mathbf{x}" />
          </button>
        </div>
      </div>

      <!-- JSXGraph Interactive Board -->
      <div ref="boardContainerRef" class="jsxgraph-canvas" />

      <!-- Bottom HUD: Probe Pill, Visual Legend & Floating Controls (zero-overlap responsive stack) -->
      <div class="board-bottom-hud">
        <div
          v-if="probeReadout && !singularFieldWarning"
          class="field-probe-pill"
          role="status"
          aria-live="polite"
        >
          <span class="probe-chip">
            (<strong>{{ probeReadout.x }}</strong>, <strong>{{ probeReadout.y }}</strong>)
          </span>
          <span class="probe-chip">
            {{ probeReadout.vecLabel }} = ({{ probeReadout.vx }}, {{ probeReadout.vy }})
          </span>
          <span class="probe-chip">
            Div: <strong>{{ probeReadout.divText }}</strong>
            <small v-if="probeReadout.divTag">({{ probeReadout.divTag }})</small>
          </span>
          <span class="probe-chip">
            Curl: <strong>{{ probeReadout.curlText }}</strong>
            <small v-if="probeReadout.curlTag">({{ probeReadout.curlTag }})</small>
          </span>
          <span v-if="probeReadout.scalarText !== null" class="probe-chip scalar">
            f = <strong>{{ probeReadout.scalarText }}</strong>
          </span>
        </div>

        <div class="hud-bottom-row">
          <div class="canvas-legend">
            <div class="legend-item">
              <span class="legend-line dashed" />
              <span>Original (<KatexMath tex="\mathbf{x}" />)</span>
            </div>
            <div class="legend-item">
              <span class="legend-line solid" />
              <span>Transformed (<KatexMath tex="M\mathbf{x}" />)</span>
            </div>
            <div v-if="transformStore.showTransformedGrid" class="legend-item">
              <span class="legend-line warped" />
              <span>Warped Grid</span>
            </div>
            <div v-if="transformStore.showSvd" class="legend-item">
              <span class="legend-line svd" />
              <span>SVD Ellipse</span>
            </div>
            <div
              v-if="transformStore.showSubspaces && transformStore.evaluatedScene.activeStepAnalysis.rank < 2"
              class="legend-item"
            >
              <span class="legend-line col-space" />
              <span>Col(M)</span>
              <span class="legend-line null-space" />
              <span>Null(M)</span>
            </div>
            <div v-if="transformStore.showBasisVectors" class="legend-item">
              <span class="legend-dot e1" />
              <span><KatexMath tex="\mathbf{e}_1" /></span>
              <span class="legend-dot e2" />
              <span><KatexMath tex="\mathbf{e}_2" /></span>
            </div>
            <div v-if="activeHeatmapField" class="legend-item">
              <span
                class="heatmap-swatch"
                :class="activeHeatmapField.colorOverlay === 'scalar' ? 'scalar' : 'calc'"
              />
              <span v-if="activeHeatmapField.colorOverlay === 'scalar'">Low f ↔ Peak f</span>
              <span v-else-if="activeHeatmapField.colorOverlay === 'divergence'">Sink ↔ Source</span>
              <span v-else>CW ↔ CCW</span>
            </div>
          </div>

          <!-- Floating View Controls (Zoom / Reset / Clear) -->
          <div class="canvas-controls">
            <button type="button" class="ctrl-btn" title="Zoom In" @click="renderer.zoomIn()">+</button>
            <button type="button" class="ctrl-btn" title="Zoom Out" @click="renderer.zoomOut()">−</button>
            <button type="button" class="ctrl-btn reset-btn" title="Reset View to [-5.5, 5.5]" @click="renderer.resetView()">
              Reset View
            </button>
            <button
              v-if="sceneStore.vectorFields.length > 0"
              type="button"
              class="ctrl-btn clear-ctrl-btn"
              title="Remove vector fields from the canvas"
              @click="sceneStore.clearVectorFields()"
            >
              Clear Field
            </button>
            <button
              v-if="sceneStore.objects.length > 0"
              type="button"
              class="ctrl-btn clear-ctrl-btn"
              title="Clear all objects and fields from the canvas"
              @click="sceneStore.clearScene()"
            >
              Clear All
            </button>
            <button
              v-if="!showExperimentBanner"
              type="button"
              class="ctrl-btn reset-btn"
              @click="showExperimentBanner = true"
            >
              ? Guide
            </button>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.canvas-viewport {
  position: relative;
  width: 100%;
  height: 100%;
  background: var(--bg-canvas);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.morph-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem 0.85rem;
  padding: 0.42rem 0.75rem;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border-subtle);
  z-index: 6;
}

.morph-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.morph-play-btn {
  padding: 0.26rem 0.65rem;
  border-radius: 6px;
  border: 1px solid rgba(56, 189, 248, 0.45);
  background: rgba(56, 189, 248, 0.14);
  color: var(--accent-cyan);
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.12s ease;
}

.morph-play-btn:hover:not(:disabled) {
  background: rgba(56, 189, 248, 0.25);
}

.morph-play-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.morph-slider-wrap {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.74rem;
  color: var(--text-secondary);
}

.morph-label {
  font-family: var(--font-mono);
  min-width: 62px;
  color: var(--text-primary);
}

.morph-slider {
  width: clamp(72px, 10vw, 140px);
  accent-color: var(--accent-cyan);
  cursor: pointer;
}

.morph-snap-btn {
  padding: 0.18rem 0.42rem;
  border-radius: 4px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 0.69rem;
  cursor: pointer;
}

.morph-snap-btn:hover:not(:disabled) {
  border-color: var(--accent-cyan);
  color: var(--text-primary);
}

.morph-snap-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.flow-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.38rem;
}

.flow-play-btn,
.seed-mode-btn {
  padding: 0.25rem 0.6rem;
  border-radius: 6px;
  border: 1px solid rgba(45, 212, 191, 0.45);
  background: rgba(45, 212, 191, 0.12);
  color: var(--accent-teal);
  font-size: 0.74rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.12s ease;
}

.flow-play-btn:hover:not(:disabled),
.seed-mode-btn:hover:not(:disabled) {
  background: rgba(45, 212, 191, 0.22);
}

.flow-play-btn.active,
.seed-mode-btn.active {
  background: var(--accent-teal);
  color: #090d16;
  border-color: var(--accent-teal);
}

.flow-play-btn:disabled,
.seed-mode-btn:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}

.drag-hint {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.hint-e1 {
  color: #f87171;
  font-weight: 600;
}

.hint-e2 {
  color: #4ade80;
  font-weight: 600;
}

.hint-sub {
  opacity: 0.75;
}

.board-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
}

.jsxgraph-canvas {
  width: 100%;
  height: 100%;
  flex: 1;
}

.jsxgraph-canvas :deep(.JXGtext) {
  pointer-events: none;
  user-select: none;
}

.experiment-banner {
  position: absolute;
  top: 0.75rem;
  left: 0.75rem;
  right: 0.75rem;
  z-index: 5;
  background: rgba(15, 23, 42, 0.9);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(56, 189, 248, 0.35);
  border-radius: 8px;
  padding: 0.55rem 0.8rem;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}

.exp-content {
  font-size: 0.75rem;
  line-height: 1.4;
  color: var(--text-secondary);
}

.exp-tag {
  display: inline-block;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  background: rgba(56, 189, 248, 0.18);
  color: var(--accent-cyan);
  margin-right: 0.45rem;
}

.exp-content strong {
  color: var(--text-primary);
}

.exp-content p {
  margin: 0.2rem 0 0;
}

.dismiss-btn {
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0.15rem 0.3rem;
}

.singular-overlay-alert {
  position: absolute;
  bottom: 3.1rem;
  left: 0.75rem;
  right: 0.75rem;
  z-index: 5;
  background: rgba(69, 26, 3, 0.92);
  border: 1px solid rgba(245, 158, 11, 0.6);
  border-radius: 8px;
  padding: 0.55rem 0.75rem;
  font-size: 0.74rem;
  color: #fef3c7;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.singular-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.alert-action-btn {
  padding: 0.25rem 0.55rem;
  border-radius: 5px;
  border: 1px solid rgba(251, 191, 36, 0.5);
  background: rgba(245, 158, 11, 0.2);
  color: #fef3c7;
  font-size: 0.72rem;
  cursor: pointer;
}

.board-bottom-hud {
  position: absolute;
  bottom: 0.75rem;
  left: 0.75rem;
  right: 0.75rem;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  pointer-events: none;
}

.hud-bottom-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.canvas-controls {
  margin-left: auto;
  flex: 0 1 auto;
  max-width: 100%;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem;
  background: rgba(15, 23, 42, 0.88);
  padding: 0.3rem;
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
  pointer-events: auto;
}

.ctrl-btn {
  min-width: 28px;
  height: 28px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
  color: var(--text-primary);
  border-radius: 5px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0 0.45rem;
}

.ctrl-btn:hover {
  border-color: var(--accent-cyan);
}

.reset-btn {
  font-size: 0.72rem;
}

.clear-ctrl-btn {
  font-size: 0.72rem;
  border-color: rgba(244, 63, 94, 0.4);
  color: #fda4af;
}

.clear-ctrl-btn:hover {
  border-color: #fb7185;
  background: rgba(244, 63, 94, 0.16);
}

.field-probe-pill {
  align-self: flex-start;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.45rem 0.65rem;
  background: rgba(15, 23, 42, 0.92);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(56, 189, 248, 0.35);
  border-radius: 8px;
  padding: 0.32rem 0.65rem;
  font-family: var(--font-mono);
  font-size: 0.71rem;
  color: var(--text-secondary);
}

.probe-chip strong {
  color: var(--text-primary);
}

.probe-chip small {
  color: var(--text-muted);
  margin-left: 0.2rem;
}

.probe-chip.scalar strong {
  color: #fbbf24;
}

.canvas-legend {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem 0.75rem;
  background: rgba(15, 23, 42, 0.88);
  padding: 0.35rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
  font-size: 0.72rem;
  color: var(--text-secondary);
  pointer-events: auto;
}

.heatmap-swatch {
  width: 22px;
  height: 7px;
  border-radius: 999px;
}

.heatmap-swatch.calc {
  background: linear-gradient(90deg, #f43f5e, #94a3b8, #2dd4bf);
}

.heatmap-swatch.scalar {
  background: linear-gradient(90deg, #38bdf8, #94a3b8, #fbbf24);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.legend-line {
  width: 18px;
  height: 0;
}

.legend-line.dashed {
  border-top: 2px dashed #94a3b8;
}

.legend-line.solid {
  border-top: 2.5px solid #38bdf8;
}

.legend-line.warped {
  border-top: 1.5px solid rgba(56, 189, 248, 0.55);
}

.legend-line.svd {
  border-top: 2px solid #e879f9;
}

.legend-line.col-space {
  border-top: 2.5px solid #22d3ee;
}

.legend-line.null-space {
  border-top: 2px dashed #fb923c;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.legend-dot.e1 {
  background: #ef4444;
}

.legend-dot.e2 {
  background: #22c55e;
}
</style>
