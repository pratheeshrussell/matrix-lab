<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EDUCATIONAL_PRESETS } from '../../engine/educationalPresets'
import { JSXGraphRenderer } from '../../renderers/JSXGraphRenderer'
import { useSceneStore } from '../../stores/sceneStore'
import { useTransformationStore } from '../../stores/transformationStore'
import KatexMath from './KatexMath.vue'

const sceneStore = useSceneStore()
const transformStore = useTransformationStore()

const boardContainerRef = ref<HTMLElement | null>(null)
const renderer = new JSXGraphRenderer()
const showExperimentBanner = ref(true)
const isPlayingMorph = ref(false)

let resizeObserver: ResizeObserver | null = null
let animFrameId: number | null = null
let lastFrameTime = 0

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
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId)
    animFrameId = null
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
  lastFrameTime = performance.now()

  const tick = (now: number): void => {
    if (!isPlayingMorph.value) return
    const dtSeconds = Math.min(0.05, (now - lastFrameTime) / 1000)
    lastFrameTime = now

    const totalSteps = Math.max(1, transformStore.enabledSteps.length)
    const durationSeconds = 1.6 * totalSteps
    const nextT = transformStore.morphT + dtSeconds / durationSeconds

    if (nextT >= 1) {
      transformStore.setMorphT(1)
      stopMorphAnimation()
      return
    }

    transformStore.setMorphT(nextT)
    animFrameId = requestAnimationFrame(tick)
  }

  animFrameId = requestAnimationFrame(tick)
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
  })
  renderer.render(transformStore.evaluatedScene)

  resizeObserver = new ResizeObserver(() => {
    renderer.resize()
    renderer.render(transformStore.evaluatedScene)
  })
  resizeObserver.observe(boardContainerRef.value)
})

watch(
  () => transformStore.evaluatedScene,
  (newScene) => {
    renderer.render(newScene)
  },
  { deep: true },
)

onBeforeUnmount(() => {
  stopMorphAnimation()
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

      <div class="drag-hint" title="Drag the circular handles directly on the coordinate plane">
        Drag <span class="hint-e1">A·e₁</span>, <span class="hint-e2">A·e₂</span>, points, or vector tips
        <span class="hint-sub">(Shift = snap 0.25)</span>
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

      <!-- Floating Visual Legend -->
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
        <div v-if="transformStore.showBasisVectors" class="legend-item">
          <span class="legend-dot e1" />
          <span><KatexMath tex="\mathbf{e}_1" /></span>
          <span class="legend-dot e2" />
          <span><KatexMath tex="\mathbf{e}_2" /></span>
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
  gap: 0.45rem;
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
  width: 140px;
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

.canvas-controls {
  position: absolute;
  bottom: 0.75rem;
  right: 0.75rem;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  background: rgba(15, 23, 42, 0.88);
  padding: 0.3rem;
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
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

.canvas-legend {
  position: absolute;
  bottom: 0.75rem;
  left: 0.75rem;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 0.8rem;
  background: rgba(15, 23, 42, 0.88);
  padding: 0.35rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
  font-size: 0.72rem;
  color: var(--text-secondary);
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
