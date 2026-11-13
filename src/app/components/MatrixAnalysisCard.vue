<script setup lang="ts">
import { computed } from 'vue'
import { formatNumber, type Mat2 } from '../../domain/math/Matrix2'
import { useTransformationStore } from '../../stores/transformationStore'
import KatexMath from './KatexMath.vue'

const transformStore = useTransformationStore()

const analysis = computed(() => transformStore.evaluatedScene.activeStepAnalysis)
const isStepThrough = computed(() => transformStore.visualizationMode === 'step-through')
const headerTitle = computed(() => {
  if (transformStore.visualizationMode === 'original') {
    return 'Active Matrix (Identity I)'
  }
  if (transformStore.morphT < 1) {
    return `Active Matrix (t = ${transformStore.morphT.toFixed(2)})`
  }
  if (isStepThrough.value) {
    return `Cumulative Matrix (Step ${transformStore.evaluatedScene.activeStepIndex})`
  }
  return 'Composite Matrix M'
})

function matrixToLatex(m: Mat2): string {
  return `\\begin{bmatrix} ${formatNumber(m[0], 3)} & ${formatNumber(m[1], 3)} \\\\ ${formatNumber(m[2], 3)} & ${formatNumber(m[3], 3)} \\end{bmatrix}`
}
</script>

<template>
  <section class="analysis-card">
    <div class="analysis-header">
      <h3>
        {{ headerTitle }}
      </h3>
      <span
        class="status-pill"
        :class="{
          preserved: analysis.orientation === 'preserved',
          reversed: analysis.orientation === 'reversed',
          collapsed: analysis.orientation === 'collapsed',
        }"
      >
        {{
          analysis.orientation === 'preserved'
            ? 'Orientation Preserved'
            : analysis.orientation === 'reversed'
              ? 'Orientation Flipped'
              : 'Singular (Collapsed)'
        }}
      </span>
    </div>

    <!-- Composite Matrix & Basis Columns Display -->
    <div class="composite-display">
      <div class="matrix-equation">
        <KatexMath :tex="`M = ${matrixToLatex(analysis.matrix)}`" :display-mode="true" />
      </div>

      <div class="basis-columns-explain">
        <div class="col-chip col-e1">
          <span class="col-dot e1-dot" />
          <span>Col 1 = <KatexMath tex="M\mathbf{e}_1" /> = ({{ formatNumber(analysis.transformedBasisE1[0]) }}, {{ formatNumber(analysis.transformedBasisE1[1]) }})</span>
        </div>
        <div class="col-chip col-e2">
          <span class="col-dot e2-dot" />
          <span>Col 2 = <KatexMath tex="M\mathbf{e}_2" /> = ({{ formatNumber(analysis.transformedBasisE2[0]) }}, {{ formatNumber(analysis.transformedBasisE2[1]) }})</span>
        </div>
      </div>
    </div>

    <!-- Key Numerical Properties Grid -->
    <div class="metrics-grid">
      <div class="metric-box">
        <span class="metric-label">Determinant <KatexMath tex="\det(M)" /></span>
        <span class="metric-value">{{ formatNumber(analysis.determinant, 3) }}</span>
        <span class="metric-sub">Area scale: {{ formatNumber(analysis.areaScaleFactor, 3) }}×</span>
      </div>

      <div class="metric-box">
        <span class="metric-label">Rank</span>
        <span class="metric-value">{{ analysis.rank }}</span>
        <span class="metric-sub">{{ analysis.rank === 2 ? '2D Plane ℝ²' : analysis.rank === 1 ? '1D Line' : '0D Origin' }}</span>
      </div>

      <div class="metric-box">
        <span class="metric-label">Trace <KatexMath tex="\text{tr}(M)" /></span>
        <span class="metric-value">{{ formatNumber(analysis.trace, 3) }}</span>
        <span class="metric-sub"><KatexMath tex="a + d = \lambda_1 + \lambda_2" /></span>
      </div>
    </div>

    <!-- Educational Explanations -->
    <div class="explanations-list">
      <div class="explain-item">
        <strong>Area &amp; Orientation:</strong> {{ analysis.determinantExplanation }}
      </div>
      <div class="explain-item">
        <strong>Image Subspace:</strong> {{ analysis.rankExplanation }}
      </div>
      <div class="explain-item">
        <strong>Invertibility:</strong> {{ analysis.invertibilityExplanation }}
        <div v-if="analysis.inverse" class="inverse-row">
          <KatexMath :tex="`M^{-1} = ${matrixToLatex(analysis.inverse)}`" />
          <button
            type="button"
            class="btn-xs"
            title="Append M^-1 as a new step in the pipeline to verify M^-1 * M = I"
            @click="transformStore.appendCompositeInverseStep()"
          >
            + Append <KatexMath tex="M^{-1}" /> to Pipeline
          </button>
        </div>
      </div>
      <div class="explain-item">
        <strong>Eigenvalues &amp; Invariant Directions:</strong> {{ analysis.eigen.summary }}
      </div>
    </div>

    <!-- Column Space & Null Space (Kernel) -->
    <div class="subspaces-section">
      <div class="svd-header">
        <strong>Column &amp; Null Space (<KatexMath tex="\text{Col}(M), \text{Null}(M)" />)</strong>
        <button
          type="button"
          class="btn-xs"
          :class="{ 'subspace-toggle-active': transformStore.showSubspaces }"
          title="Highlight Col(M) and Null(M) lines on canvas when rank < 2"
          @click="transformStore.showSubspaces = !transformStore.showSubspaces"
        >
          {{ transformStore.showSubspaces ? 'Canvas Overlay On' : 'Canvas Overlay Off' }}
        </button>
      </div>

      <div class="subspace-chips">
        <span class="subspace-pill col-pill">
          <strong><KatexMath tex="\text{Col}(M)" />:</strong> {{ analysis.subspaces.columnSpaceLabel }}
        </span>
        <span class="subspace-pill null-pill">
          <strong><KatexMath tex="\text{Null}(M)" />:</strong> {{ analysis.subspaces.nullSpaceLabel }}
        </span>
      </div>

      <p class="svd-summary">{{ analysis.subspaces.summary }}</p>
    </div>

    <!-- Singular Value Decomposition M = U * Sigma * V^T -->
    <div class="svd-section">
      <div class="svd-header">
        <strong>SVD (<KatexMath tex="M = U\Sigma V^T" />)</strong>
        <button
          type="button"
          class="btn-xs"
          :class="{ 'svd-toggle-active': transformStore.showSvd }"
          title="Toggle unit circle → ellipse and singular vectors on the canvas"
          @click="transformStore.showSvd = !transformStore.showSvd"
        >
          {{ transformStore.showSvd ? 'Hide Canvas Ellipse' : 'Show Canvas Ellipse' }}
        </button>
      </div>

      <div class="svd-metrics">
        <span class="svd-pill">
          <KatexMath tex="\sigma_1" /> = {{ formatNumber(analysis.svd.sigma1, 3) }}
        </span>
        <span class="svd-pill">
          <KatexMath tex="\sigma_2" /> = {{ formatNumber(analysis.svd.sigma2, 3) }}
        </span>
        <span class="svd-pill">
          <KatexMath tex="\kappa" /> =
          {{ analysis.svd.conditionNumber !== null ? formatNumber(analysis.svd.conditionNumber, 2) : '∞' }}
        </span>
      </div>

      <p class="svd-summary">{{ analysis.svd.summary }}</p>

      <div class="svd-matrices">
        <KatexMath
          :tex="`U = ${matrixToLatex(analysis.svd.u)},\\; \\Sigma = ${matrixToLatex(analysis.svd.sigma)},\\; V^T = ${matrixToLatex(analysis.svd.vT)}`"
          :display-mode="true"
        />
      </div>

      <button
        type="button"
        class="btn-xs svd-expand-btn"
        title="Replace current pipeline with 3 explicit SVD steps: Vᵀ (Rotate) → Σ (Scale) → U (Rotate/Reflect)"
        @click="transformStore.decomposePipelineToSvd()"
      >
        Convert Pipeline to 3 SVD Steps (<KatexMath tex="V^T \to \Sigma \to U" />)
      </button>
    </div>
  </section>
</template>

<style scoped>
.analysis-card {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.analysis-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
}

.analysis-header h3 {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-primary);
}

.status-pill {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 0.16rem 0.45rem;
  border-radius: 999px;
}

.status-pill.preserved {
  background: rgba(16, 185, 129, 0.16);
  color: #34d399;
}

.status-pill.reversed {
  background: rgba(244, 63, 94, 0.16);
  color: #fb7185;
}

.status-pill.collapsed {
  background: rgba(245, 158, 11, 0.18);
  color: #fbbf24;
}

.composite-display {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.matrix-equation :deep(.katex-display) {
  margin: 0.25rem 0;
}

.basis-columns-explain {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.72rem;
  color: var(--text-secondary);
}

.col-chip {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.col-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.e1-dot {
  background: #ef4444;
}

.e2-dot {
  background: #22c55e;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.4rem;
}

.metric-box {
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 0.4rem 0.45rem;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.metric-label {
  font-size: 0.67rem;
  color: var(--text-muted);
}

.metric-value {
  font-family: var(--font-mono);
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--accent-cyan);
}

.metric-sub {
  font-size: 0.65rem;
  color: var(--text-secondary);
}

.explanations-list {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  font-size: 0.72rem;
  line-height: 1.4;
  color: var(--text-secondary);
}

.explain-item strong {
  color: var(--text-primary);
}

.inverse-row {
  margin-top: 0.35rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.4rem;
  padding: 0.35rem 0.45rem;
  background: rgba(15, 23, 42, 0.5);
  border-radius: 5px;
}

.svd-section {
  border-top: 1px solid var(--border-subtle);
  padding-top: 0.55rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  font-size: 0.72rem;
  color: var(--text-secondary);
}

.svd-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
}

.svd-header strong {
  color: var(--text-primary);
}

.svd-toggle-active {
  border-color: #e879f9;
  color: #f5d0fe;
  background: rgba(232, 121, 249, 0.14);
}

.svd-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.svd-pill {
  font-family: var(--font-mono);
  font-size: 0.69rem;
  padding: 0.14rem 0.42rem;
  border-radius: 5px;
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid var(--border-subtle);
  color: #f5d0fe;
}

.svd-summary {
  margin: 0;
  line-height: 1.4;
}

.svd-matrices {
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 0.3rem 0.4rem;
  overflow-x: auto;
}

.svd-matrices :deep(.katex-display) {
  margin: 0.2rem 0;
  font-size: 0.86em;
}

.svd-expand-btn {
  align-self: flex-start;
  border-color: rgba(232, 121, 249, 0.45);
  color: #f5d0fe;
}

.subspaces-section {
  border-top: 1px solid var(--border-subtle);
  padding-top: 0.55rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  font-size: 0.72rem;
  color: var(--text-secondary);
}

.subspace-toggle-active {
  border-color: #22d3ee;
  color: #cffafe;
  background: rgba(34, 211, 238, 0.14);
}

.subspace-chips {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.subspace-pill {
  font-family: var(--font-mono);
  font-size: 0.69rem;
  padding: 0.2rem 0.45rem;
  border-radius: 5px;
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid var(--border-subtle);
}

.col-pill {
  border-color: rgba(34, 211, 238, 0.35);
  color: #a5f3fc;
}

.null-pill {
  border-color: rgba(251, 146, 60, 0.35);
  color: #fed7aa;
}
</style>
