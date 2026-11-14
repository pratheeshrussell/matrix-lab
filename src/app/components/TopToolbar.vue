<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { formatNumber, type Mat2 } from '../../domain/math/Matrix2'
import type { VisualizationMode } from '../../domain/math/Transform'
import { EDUCATIONAL_PRESETS } from '../../engine/educationalPresets'
import { buildShareUrl } from '../../engine/ShareState'
import { useTransformationStore } from '../../stores/transformationStore'
import KatexMath from './KatexMath.vue'

const transformStore = useTransformationStore()
const shareStatus = ref<'idle' | 'copied' | 'updated'>('idle')
let shareResetTimer: number | null = null

const modes: { id: VisualizationMode; label: string; hint: string }[] = [
  { id: 'original', label: 'Original', hint: 'Show only untransformed scene (Identity)' },
  { id: 'overlay', label: 'Overlay', hint: 'Compare original (dashed) and transformed (solid)' },
  { id: 'transformed', label: 'Transformed', hint: 'Show only final transformed scene' },
  {
    id: 'step-through',
    label: 'Step-Through',
    hint: 'Scrub step-by-step through the transformation pipeline',
  },
]

const snapshots = computed(() => transformStore.evaluatedScene.stepSnapshots)
const activeSnapshot = computed(
  () => snapshots.value[transformStore.evaluatedScene.activeStepIndex] ?? snapshots.value[0],
)

function matrixToLatex(m: Mat2): string {
  return `\\begin{bmatrix} ${formatNumber(m[0], 2)} & ${formatNumber(m[1], 2)} \\\\ ${formatNumber(m[2], 2)} & ${formatNumber(m[3], 2)} \\end{bmatrix}`
}

function handlePresetChange(event: Event): void {
  const target = event.target as HTMLSelectElement
  if (target.value) {
    transformStore.loadEducationalPreset(target.value)
  }
}

async function copyShareLink(): Promise<void> {
  const shareUrl = buildShareUrl(window.location.href, transformStore.exportShareSnapshot())
  window.history.replaceState(null, '', shareUrl)

  let copied = false
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(shareUrl)
      copied = true
    } catch {
      copied = false
    }
  }

  shareStatus.value = copied ? 'copied' : 'updated'
  if (shareResetTimer !== null) {
    window.clearTimeout(shareResetTimer)
  }
  shareResetTimer = window.setTimeout(() => {
    shareStatus.value = 'idle'
    shareResetTimer = null
  }, 2200)
}

onBeforeUnmount(() => {
  if (shareResetTimer !== null) {
    window.clearTimeout(shareResetTimer)
  }
})
</script>

<template>
  <header class="top-toolbar">
    <div class="brand-cluster">
      <div class="brand-logo" aria-hidden="true">
        <span class="bracket">[</span>
        <span class="matrix-dots">M</span>
        <span class="bracket">]</span>
      </div>
      <div>
        <h1 class="brand-title">Matrix-Lab</h1>
        <p class="brand-subtitle">2D Linear Transformations &amp; Vector Fields</p>
      </div>
    </div>

    <!-- Visualization Mode Switcher -->
    <div class="mode-switcher" role="tablist" aria-label="Visualization modes">
      <button
        v-for="mode in modes"
        :key="mode.id"
        type="button"
        role="tab"
        :aria-selected="transformStore.visualizationMode === mode.id"
        :title="mode.hint"
        class="mode-btn"
        :class="{ active: transformStore.visualizationMode === mode.id }"
        @click="transformStore.visualizationMode = mode.id"
      >
        {{ mode.label }}
      </button>
    </div>

    <!-- Reference Overlays & Presets -->
    <div class="toolbar-actions">
      <div class="toggle-group">
        <label class="chip-toggle" title="Display transformed integer coordinate grid lines">
          <input v-model="transformStore.showTransformedGrid" type="checkbox" />
          <span>Warped Grid</span>
        </label>

        <label class="chip-toggle" title="Display RK4 streamlines for visible vector fields">
          <input v-model="transformStore.showStreamlines" type="checkbox" />
          <span>Streamlines</span>
        </label>

        <label class="chip-toggle" title="Display standard basis vectors e1=[1,0] and e2=[0,1]">
          <input v-model="transformStore.showBasisVectors" type="checkbox" />
          <span>Basis <KatexMath tex="\mathbf{e}_1, \mathbf{e}_2" /></span>
        </label>

        <label class="chip-toggle" title="Display unit square and transformed area parallelogram">
          <input v-model="transformStore.showUnitSquare" type="checkbox" />
          <span>Unit Area</span>
        </label>

        <label class="chip-toggle" title="Display real eigenvector invariant lines through origin">
          <input v-model="transformStore.showEigenvectors" type="checkbox" />
          <span>Eigenvectors</span>
        </label>

        <label
          class="chip-toggle"
          title="Visualize SVD geometry: unit circle → ellipse and singular vectors (v₁,v₂ → σ₁u₁,σ₂u₂)"
        >
          <input v-model="transformStore.showSvd" type="checkbox" />
          <span>SVD Ellipse</span>
        </label>

        <label
          class="chip-toggle"
          title="Highlight Column Space Col(M) and Null Space Null(M) when det(M) = 0"
        >
          <input v-model="transformStore.showSubspaces" type="checkbox" />
          <span>Col / Null</span>
        </label>
      </div>

      <div class="preset-share-group">
        <div class="preset-selector">
          <label for="edu-preset-select" class="sr-only">Educational Experiments</label>
          <select
            id="edu-preset-select"
            :value="transformStore.activeEducationalPresetId"
            class="select-input"
            @change="handlePresetChange"
          >
            <option v-for="preset in EDUCATIONAL_PRESETS" :key="preset.id" :value="preset.id">
              {{ preset.title }}
            </option>
          </select>
        </div>

        <button
          type="button"
          class="share-btn"
          :class="{ copied: shareStatus !== 'idle' }"
          title="Encode current scene, matrices, and overlays into a shareable URL and copy to clipboard"
          @click="copyShareLink"
        >
          {{
            shareStatus === 'copied'
              ? '✓ Link Copied'
              : shareStatus === 'updated'
                ? '✓ URL Updated'
                : '🔗 Share'
          }}
        </button>
      </div>
    </div>

    <!-- Step-Through Scrubber Bar -->
    <div v-if="transformStore.visualizationMode === 'step-through'" class="step-through-bar">
      <div class="step-controls">
        <span class="step-badge">Step-Through Mode</span>
        <button
          type="button"
          class="btn-sm"
          :disabled="transformStore.evaluatedScene.activeStepIndex <= 0"
          @click="transformStore.setActiveStepIndex(transformStore.evaluatedScene.activeStepIndex - 1)"
        >
          ◀ Prev
        </button>

        <div class="step-pills">
          <button
            v-for="snap in snapshots"
            :key="snap.stepIndex"
            type="button"
            class="step-pill"
            :class="{ active: transformStore.evaluatedScene.activeStepIndex === snap.stepIndex }"
            @click="transformStore.setActiveStepIndex(snap.stepIndex)"
          >
            <span class="pill-num">{{ snap.stepIndex === 0 ? '0: Orig' : `Step ${snap.stepIndex}` }}</span>
            <span class="pill-name">{{ snap.stepName }}</span>
          </button>
        </div>

        <button
          type="button"
          class="btn-sm"
          :disabled="transformStore.evaluatedScene.activeStepIndex >= snapshots.length - 1"
          @click="transformStore.setActiveStepIndex(transformStore.evaluatedScene.activeStepIndex + 1)"
        >
          Next ▶
        </button>
      </div>

      <div v-if="activeSnapshot" class="step-math-summary">
        <span>Active Step Matrix:</span>
        <KatexMath :tex="matrixToLatex(activeSnapshot.stepMatrix)" />
        <span class="divider">|</span>
        <span>Cumulative Matrix after Step {{ activeSnapshot.stepIndex }}:</span>
        <KatexMath :tex="matrixToLatex(activeSnapshot.cumulativeMatrix)" />
      </div>
    </div>
  </header>
</template>

<style scoped>
.top-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: 0.55rem 0.9rem;
  padding: 0.5rem 0.85rem;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border-subtle);
  z-index: 10;
}

.brand-cluster {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex-shrink: 0;
}

.brand-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(168, 85, 247, 0.2));
  border: 1px solid rgba(56, 189, 248, 0.4);
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.85rem;
  color: var(--accent-cyan);
}

.brand-logo .bracket {
  color: var(--text-muted);
}

.brand-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text-primary);
}

.brand-subtitle {
  margin: 0;
  font-size: 0.68rem;
  color: var(--text-muted);
}

.mode-switcher {
  display: inline-flex;
  flex-shrink: 0;
  background: var(--bg-elevated);
  padding: 0.18rem;
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
}

.mode-btn {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.76rem;
  font-weight: 600;
  padding: 0.32rem 0.65rem;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}

.mode-btn:hover {
  color: var(--text-primary);
}

.mode-btn.active {
  background: var(--accent-cyan);
  color: #090d16;
  box-shadow: 0 1px 4px rgba(56, 189, 248, 0.35);
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-left: auto;
}

.toggle-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.chip-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.24rem 0.42rem;
  border-radius: 6px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  font-size: 0.71rem;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

.chip-toggle:hover {
  border-color: var(--border-focus);
  color: var(--text-primary);
}

.chip-toggle input {
  accent-color: var(--accent-cyan);
  margin: 0;
}

.preset-share-group {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.select-input {
  background: var(--bg-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 0.28rem 0.45rem;
  font-size: 0.73rem;
  max-width: 160px;
}

.share-btn {
  padding: 0.28rem 0.55rem;
  border-radius: 6px;
  border: 1px solid rgba(56, 189, 248, 0.42);
  background: rgba(56, 189, 248, 0.12);
  color: var(--accent-cyan);
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.12s ease;
}

.share-btn:hover {
  background: rgba(56, 189, 248, 0.22);
}

.share-btn.copied {
  border-color: rgba(45, 212, 191, 0.65);
  background: rgba(45, 212, 191, 0.18);
  color: var(--accent-teal);
}

@media (max-width: 1420px) {
  .toolbar-actions {
    width: 100%;
    margin-left: 0;
    justify-content: space-between;
    padding-top: 0.45rem;
    border-top: 1px solid var(--border-subtle);
  }
}

.step-through-bar {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border-subtle);
}

.step-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.step-badge {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--accent-amber);
  background: rgba(245, 158, 11, 0.14);
  padding: 0.22rem 0.5rem;
  border-radius: 4px;
}

.step-pills {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.step-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.6rem;
  border-radius: 6px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-size: 0.75rem;
  cursor: pointer;
}

.step-pill.active {
  border-color: var(--accent-amber);
  background: rgba(245, 158, 11, 0.18);
  color: var(--text-primary);
}

.pill-num {
  font-weight: 700;
  color: var(--accent-amber);
}

.step-math-summary {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.76rem;
  color: var(--text-secondary);
}

.divider {
  color: var(--border-subtle);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
</style>
