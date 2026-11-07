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

let resizeObserver: ResizeObserver | null = null

const activeExperiment = computed(() =>
  EDUCATIONAL_PRESETS.find((p) => p.id === transformStore.activeEducationalPresetId),
)

const singularFieldWarning = computed(() => {
  const field = transformStore.evaluatedScene.transformedFields.find(
    (f) => f.visible && f.singularPushforwardUnavailable,
  )
  return field?.singularExplanation ?? null
})

onMounted(() => {
  if (!boardContainerRef.value) return
  renderer.initialize(boardContainerRef.value)
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
  resizeObserver?.disconnect()
  renderer.destroy()
})
</script>

<template>
  <main class="canvas-viewport">
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
        <span>Original Scene (<KatexMath tex="\mathbf{x}" />)</span>
      </div>
      <div class="legend-item">
        <span class="legend-line solid" />
        <span>Transformed (<KatexMath tex="M\mathbf{x}" />)</span>
      </div>
      <div v-if="transformStore.showBasisVectors" class="legend-item">
        <span class="legend-dot e1" />
        <span><KatexMath tex="\mathbf{e}_1" /></span>
        <span class="legend-dot e2" />
        <span><KatexMath tex="\mathbf{e}_2" /></span>
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
