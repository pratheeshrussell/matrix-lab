# Matrix-Lab

**An interactive 2D linear algebra & vector calculus workbench in the browser.**

[![Live Demo](https://img.shields.io/badge/Live_Demo-Launch_Matrix--Lab-38bdf8?style=for-the-badge)](https://pratheeshrussell.github.io/matrix-lab/)
[![GitHub Repo](https://img.shields.io/badge/GitHub-pratheeshrussell%2Fmatrix--lab-181717?style=for-the-badge&logo=github)](https://github.com/pratheeshrussell/matrix-lab)
![Vue 3](https://img.shields.io/badge/Vue-3.5-42b883?style=flat-square&logo=vuedotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript)

![Matrix-Lab Workbench — 2D Linear Transformations & Vector Fields](./images/1.PNG)

Instead of treating matrices and vector calculus as static equations on paper, **Matrix-Lab** lets you drag basis vectors directly on the coordinate plane, morph space continuously from $I$ to $M$, explore **Singular Value Decomposition (SVD)** and **Column / Null Spaces**, animate **RK4 streamlines & particle flow**, and inspect **scalar potential landscapes $f(x,y) \to \nabla f$** with live **divergence** and **curl** probes—all running client-side with zero backend.

---

## Key Capabilities

### 1. Direct Canvas Manipulation & Continuous Morphing
- **Drag Basis Vectors Live:** Grab the transformed standard basis tips $A\mathbf{e}_1$ and $A\mathbf{e}_2$ directly on the canvas to watch custom matrix entries update in real time—or drag points and vector tips in your scene.
- **Continuous Morphing ($t \in [0, 1]$):** Scrub or animate **`▶ Morph`** smoothly from the Identity matrix ($t = 0$) to the full composite transformation ($t = 1$), complete with a **Warped Grid** toggle showing how integer grid lines bend, stretch, or collapse.
- **4 Visualization Modes:** Switch cleanly between **Original**, **Overlay** (original dashed vs. transformed solid), **Transformed**, and **Step-Through** (`Step 0 → Step 1 → … → Step N` with per-step and cumulative LaTeX matrices).

### 2. Ordered Matrix Pipeline & Linear Algebra Insights
- **Preset & Custom $2 \times 2$ Steps:** Compose **Rotation**, **Scaling**, **Reflection** (axes, diagonals, origin, or arbitrary angle $\theta$), **Shear**, **Projection** (rank-1 singular maps), or custom $\begin{bmatrix} a & b \\ c & d \end{bmatrix}$ matrices.
- **Explicit Column-Vector Order:** Displays $\mathbf{v}' = (A_n \cdots A_2 A_1)\,\mathbf{v}$ and lets you reorder steps ($\uparrow / \downarrow$), toggle steps on/off, duplicate steps, or append $M^{-1}$.
- **SVD Geometry & Decomposition ($M = U \Sigma V^T$):** Toggle **SVD Ellipse** to see the unit circle deform into the singular ellipse ($\mathbf{v}_1, \mathbf{v}_2 \to \sigma_1 \mathbf{u}_1, \sigma_2 \mathbf{u}_2$), or click **Decompose Pipeline into 3 SVD Steps** (rotate/reflect by $V^T$ → scale by $\Sigma$ → rotate/reflect by $U$) to step through SVD geometrically.
- **Fundamental Subspaces ($\text{Col}(M)$ & $\text{Null}(M)$):** Automatically inspects the **Rank-Nullity Theorem** ($\dim\text{Col} + \dim\text{Null} = 2$) and highlights the 1D Column Space and Null Space (Kernel) lines on the canvas whenever a transformation becomes rank-deficient ($\det(M) = 0$).
- **Matrix Properties Card:** Real-time KaTeX readouts and geometric explanations for **Determinant** (signed area factor), **Rank**, **Trace**, **Inverse $M^{-1}$**, and **Eigenvalues / Eigenvectors** (with real invariant lines rendered on the canvas).

### 3. Vector Fields, RK4 Flow & Vector Calculus ($\nabla f$, Divergence & Curl)
Vector fields $\mathbf{F}(x, y) = (P(x, y), Q(x, y))$ are stored symbolically and evaluated dynamically—never baked as static arrows.
- **Dual Input Modes (`Vector F=(P,Q)` | `Scalar f(x,y)→∇f`):**
  - Enter custom vector components $P(x, y), Q(x, y)$ (using `mathjs` syntax) or choose presets (**Radial**, **Rotational**, **Hyperbolic Saddle**, **Constant**).
  - Or switch to **Scalar Potential $f(x, y) \to \nabla f$** (or click **`+ Scalar Potential`**) with presets (**Quadratic Bowl**, **Gaussian Hill**, **Hyperbolic Saddle**, **Ripple Waves**) or any custom expression $f(x, y)$. Automatically computes numerical gradient arrows $\mathbf{F} = \nabla f$ and marching-squares **level contours $f(x, y) = c$**.
- **Color Heatmaps & Live Cursor Probe:** Shade vector fields by **Divergence** ($\nabla \cdot \mathbf{F}$), **2D Curl** ($(\nabla \times \mathbf{F})_z$), or **Scalar Height $f(x, y)$**, and move your cursor across the board to inspect exact local $(x, y)$, $\mathbf{F}(x, y)$, $f(x, y)$, $\nabla \cdot \mathbf{F}$, and $(\nabla \times \mathbf{F})_z$ values in the bottom HUD.
- **Two Transformation Semantics:**
  - **Mode A — Transform Vector Values at Fixed Coordinates:** $\mathbf{G}(\mathbf{x}) = A\,\mathbf{F}(\mathbf{x})$
  - **Mode B — Geometric Pushforward (Natural Coordinate Map):** $\mathbf{F}'(\mathbf{x}') = A\,\mathbf{F}(A^{-1}\mathbf{x}')$ (supports both uniform target-grid pullback and forward-mapped sample points, plus explicit singularity warnings when $\det(A) = 0$).
- **RK4 Streamlines & Particle Flow:** Toggle 4th-order Runge-Kutta **Streamlines**, launch animated **Flow Particles**, and click the canvas in seed mode to drop custom particle emitters.

### 4. Geometric Scene Objects, Experiments & Zero-Backend Sharing
- **Rich Scene Builder:** Add, toggle, duplicate, and edit **Points**, **Vectors**, **Line Segments & Infinite Lines**, **Polygons & Rectangles**, **Parametric Circles**, and **Function / Parametric Curves**.
- **Zero-Backend Shareable Links (`🔗 Share`):** Encodes your entire scene, transformation pipeline, morph progress, and active overlays into a compact `#s=...` URL hash for instant sharing in notes, lectures, or bug reports.
- **Built-In Curated Experiments:**
  - *Default: Rotation + Shear on Geometry & Rotational Field*
  - *Experiment 1: What happens when det(A) = 0?*
  - *Experiment 2: Orientation Reversal & Rotational Field under Reflection*
  - *Experiment 3: Why Transformation Order Matters (B·A ≠ A·B)*
  - *Experiment 4: Eigenvectors & Invariant Directions*
  - *Experiment 5: Scalar Potential f(x,y) → ∇f, Divergence & Curl*

---

## Tech Stack & Architecture

- **Framework:** Vue 3 (Composition API) + TypeScript
- **State Management:** Pinia ([sceneStore.ts](src/stores/sceneStore.ts), [transformationStore.ts](src/stores/transformationStore.ts))
- **2D Coordinate Renderer:** JSXGraph (abstracted behind [Renderer.ts](src/renderers/Renderer.ts) & [JSXGraphRenderer.ts](src/renderers/JSXGraphRenderer.ts))
- **Expression Compilation:** `mathjs` (`mathjs/number` AST compiler in [ExpressionParser.ts](src/domain/math/ExpressionParser.ts))
- **Math Typesetting:** KaTeX ([KatexMath.vue](src/app/components/KatexMath.vue))
- **Build & Test:** Vite + Vitest

```text
src/
├── app/
│   ├── components/       # TopToolbar, SceneObjectsPanel, CanvasViewport, TransformationPipelinePanel, MatrixAnalysisCard, KatexMath
│   └── styles/           # Scientific dark-mode workbench CSS theme
├── domain/
│   ├── math/             # Vector2, Matrix2, Transform, ExpressionParser
│   └── scene/            # SceneObject (GeometricSceneObject, VectorFieldSceneObject, ScalarFieldPresetId)
├── engine/               # SceneEvaluator, VectorFieldEvaluator, FlowSimulation, MatrixProperties, ShareState, educationalPresets
├── renderers/            # Renderer interface & JSXGraphRenderer implementation
└── stores/               # Pinia sceneStore and transformationStore
```

---

## Getting Started

### Install Dependencies

```sh
npm install
```

### Start Development Server

```sh
npm run dev
```

### Run Unit Tests

```sh
npm run test:unit -- --run
```

### Type-Check & Build for Production

```sh
npm run build
```

---

## Deployment (GitHub Pages)

This project deploys automatically to **GitHub Pages** via [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) with `base: '/matrix-lab/'` in [`vite.config.ts`](vite.config.ts).
