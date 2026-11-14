import JXG from 'jsxgraph'
import type { Vec2 } from '../domain/math/Vector2'
import type { EvaluatedStreamlines, FlowRenderBatch } from '../engine/FlowSimulation'
import type {
  EvaluatedCurveGeometry,
  EvaluatedGeometryItem,
  EvaluatedGridLine,
  EvaluatedLineGeometry,
  EvaluatedPointGeometry,
  EvaluatedPolygonGeometry,
  EvaluatedScene,
  EvaluatedVectorGeometry,
} from '../engine/SceneEvaluator'
import type { EvaluatedVectorField, EvaluatedVectorSample } from '../engine/VectorFieldEvaluator'
import type {
  Renderer,
  RendererInteractionCallbacks,
  WorldBoundingBox,
} from './Renderer'

const DEFAULT_BOUNDING_BOX: WorldBoundingBox = [-5.5, 5.5, 5.5, -5.5]

interface GeometryRenderStyle {
  isOriginalInOverlay: boolean
  isPrimaryTransformed: boolean
  labelSuffix: string
}

interface DesiredHandleSpec {
  key: string
  position: Vec2
  color: string
  size: number
  label: string
  onDrag: (pos: Vec2) => void
}

/**
 * JSXGraph 2D Coordinate Plane Renderer.
 * Converts EvaluatedScene mathematical coordinates into JSXGraph SVG primitives.
 */
export class JSXGraphRenderer implements Renderer {
  private board: JXG.Board | null = null
  private container: HTMLElement | null = null
  private createdElements: Array<JXG.GeometryElement | JXG.Composition | JXG.GeometryElement[]> = []
  private interactiveHandles = new Map<
    string,
    { point: JXG.Point; onDrag: (pos: Vec2) => void }
  >()
  private activeDragHandleKey: string | null = null
  private callbacks: RendererInteractionCallbacks = {}
  private defaultBox: WorldBoundingBox = DEFAULT_BOUNDING_BOX
  private shiftHeld = false
  private seedPlacementMode = false

  private flowOrigTrailCurve: JXG.Curve | null = null
  private flowOrigHeadCurve: JXG.Curve | null = null
  private flowTransTrailCurve: JXG.Curve | null = null
  private flowTransHeadCurve: JXG.Curve | null = null

  private flowOrigTrailX: number[] = []
  private flowOrigTrailY: number[] = []
  private flowOrigHeadX: number[] = []
  private flowOrigHeadY: number[] = []
  private flowTransTrailX: number[] = []
  private flowTransTrailY: number[] = []
  private flowTransHeadX: number[] = []
  private flowTransHeadY: number[] = []

  private readonly handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Shift') this.shiftHeld = true
  }

  private readonly handleKeyUp = (e: KeyboardEvent): void => {
    if (e.key === 'Shift') this.shiftHeld = false
  }

  private isNearInteractiveHandle(ux: number, uy: number, radiusPx = 16): boolean {
    if (!this.board || !Number.isFinite(ux) || !Number.isFinite(uy)) return false
    const unitX = Math.abs(this.board.unitX || 1)
    const unitY = Math.abs(this.board.unitY || 1)
    for (const entry of this.interactiveHandles.values()) {
      const dxPx = (ux - entry.point.X()) * unitX
      const dyPx = (uy - entry.point.Y()) * unitY
      if (Math.hypot(dxPx, dyPx) <= radiusPx) {
        return true
      }
    }
    return false
  }

  private readonly handleCanvasDoubleClick = (e: MouseEvent): void => {
    if (!this.board || !this.callbacks.onCanvasSeedClick) return
    const coords = this.board.getUsrCoordsOfMouse(e)
    if (
      Number.isFinite(coords[0]) &&
      Number.isFinite(coords[1]) &&
      !this.isNearInteractiveHandle(coords[0], coords[1])
    ) {
      this.callbacks.onCanvasSeedClick([coords[0], coords[1]], false)
    }
  }

  private readonly handleCanvasPointerDown = (e: PointerEvent): void => {
    if (!this.seedPlacementMode || !this.board || !this.callbacks.onCanvasSeedClick) return
    if (e.pointerType === 'mouse' && e.button !== 0) return

    const coords = this.board.getUsrCoordsOfMouse(e)
    if (!Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) return

    // Never block dragging an interactive handle even when seed placement mode is armed
    if (this.isNearInteractiveHandle(coords[0], coords[1])) {
      return
    }

    e.stopPropagation()
    e.preventDefault()
    this.callbacks.onCanvasSeedClick([coords[0], coords[1]], e.shiftKey)
  }

  private readonly handleCanvasPointerMove = (e: PointerEvent): void => {
    if (!this.board || !this.callbacks.onCanvasPointerMove) return
    const coords = this.board.getUsrCoordsOfMouse(e)
    if (Number.isFinite(coords[0]) && Number.isFinite(coords[1])) {
      this.callbacks.onCanvasPointerMove([coords[0], coords[1]])
    } else {
      this.callbacks.onCanvasPointerMove(null)
    }
  }

  private readonly handleCanvasPointerLeave = (): void => {
    this.callbacks.onCanvasPointerMove?.(null)
  }

  public initialize(
    container: HTMLElement,
    initialBox: WorldBoundingBox = DEFAULT_BOUNDING_BOX,
    callbacks: RendererInteractionCallbacks = {},
  ): void {
    this.destroy()
    this.container = container
    this.defaultBox = initialBox
    this.callbacks = callbacks

    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('keyup', this.handleKeyUp)
    container.addEventListener('dblclick', this.handleCanvasDoubleClick)
    container.addEventListener('pointerdown', this.handleCanvasPointerDown, true)
    container.addEventListener('pointermove', this.handleCanvasPointerMove)
    container.addEventListener('pointerleave', this.handleCanvasPointerLeave)

    this.board = JXG.JSXGraph.initBoard(container, {
      boundingbox: [...initialBox],
      keepaspectratio: true,
      axis: false,
      grid: false,
      showNavigation: false,
      showCopyright: false,
      pan: {
        enabled: true,
        needShift: false,
        needTwoFingers: false,
      },
      zoom: {
        wheel: true,
        needShift: false,
        min: 0.08,
        max: 15,
      },
      registerEvents: true,
    })

    this.createCoordinatePlaneAxesAndGrid()
    this.createFlowParticleLayers()
  }

  private createFlowParticleLayers(): void {
    if (!this.board) return

    const bindCurve = (
      getXs: () => number[],
      getYs: () => number[],
      attrs: JXG.CurveAttributes,
    ): JXG.Curve => {
      const curve = this.board!.create('curve', [[], []], {
        ...attrs,
        fixed: true,
        highlight: false,
      })
      curve.updateDataArray = function (this: JXG.Curve) {
        this.dataX = getXs()
        this.dataY = getYs()
      }
      return curve
    }

    this.flowOrigTrailCurve = bindCurve(
      () => this.flowOrigTrailX,
      () => this.flowOrigTrailY,
      {
        strokeColor: '#94a3b8',
        strokeWidth: 1.6,
        strokeOpacity: 0.55,
      },
    )

    this.flowOrigHeadCurve = bindCurve(
      () => this.flowOrigHeadX,
      () => this.flowOrigHeadY,
      {
        strokeColor: '#cbd5e1',
        strokeWidth: 2.2,
        strokeOpacity: 0.85,
      },
    )

    this.flowTransTrailCurve = bindCurve(
      () => this.flowTransTrailX,
      () => this.flowTransTrailY,
      {
        strokeColor: '#2dd4bf',
        strokeWidth: 2,
        strokeOpacity: 0.88,
      },
    )

    this.flowTransHeadCurve = bindCurve(
      () => this.flowTransHeadX,
      () => this.flowTransHeadY,
      {
        strokeColor: '#f8fafc',
        strokeWidth: 2.6,
        strokeOpacity: 0.98,
      },
    )
  }

  private createCoordinatePlaneAxesAndGrid(): void {
    if (!this.board) return

    this.board.create('grid', [], {
      strokeColor: '#1e293b',
      strokeWidth: 1,
      strokeOpacity: 0.85,
       fixed: true,
      highlight: false,
    })

    // Horizontal X-axis
    const xAxis = this.board.create(
      'axis',
      [
        [0, 0],
        [1, 0],
      ],
      {
        name: 'x',
        withLabel: true,
        strokeColor: '#475569',
        strokeWidth: 1.5,
        highlight: false,
        label: {
          position: 'rt',
          offset: [-15, 14],
          strokeColor: '#94a3b8',
          fontSize: 13,
        },
        ticks: {
          strokeColor: '#475569',
          majorHeight: 8,
          drawLabels: true,
          label: {
            offset: [-4, -14],
            strokeColor: '#64748b',
            fontSize: 11,
          },
        },
      },
    )

    // Vertical Y-axis
    const yAxis = this.board.create(
      'axis',
      [
        [0, 0],
        [0, 1],
      ],
      {
        name: 'y',
        withLabel: true,
        strokeColor: '#475569',
        strokeWidth: 1.5,
        highlight: false,
        label: {
          position: 'rt',
          offset: [12, -10],
          strokeColor: '#94a3b8',
          fontSize: 13,
        },
        ticks: {
          strokeColor: '#475569',
          majorHeight: 8,
          drawLabels: true,
          label: {
            offset: [8, -2],
            strokeColor: '#64748b',
            fontSize: 11,
          },
        },
      },
    )

    void xAxis
    void yAxis
  }

  public render(scene: EvaluatedScene): void {
    if (!this.board) return

    this.board.suspendUpdate()
    try {
      this.clearDynamicElements()

      const mode = scene.visualizationMode
      const showOriginal = mode === 'original' || mode === 'overlay' || mode === 'step-through'
      const showTransformed =
        mode === 'transformed' || mode === 'overlay' || mode === 'step-through'
      const isOverlayComparison = mode === 'overlay' || mode === 'step-through'

      // 0. Warped / Transformed Coordinate Grid (drawn behind all mathematical objects)
      if (showTransformed && scene.transformedGridLines.length > 0) {
        this.renderTransformedGrid(scene.transformedGridLines)
      }

      // 1. Eigenvector invariant lines (drawn behind scene objects)
      if (scene.options.showEigenvectors) {
        this.renderEigenvectorLines(scene)
      }

      // 1.2. Fundamental subspaces Col(M) & Null(M) when singular (rank < 2)
      if (scene.options.showSubspaces && showTransformed) {
        this.renderSubspaces(scene)
      }

      // 1.3. Scalar potential level contours f(x, y) = c (behind streamlines and arrows)
      for (const field of scene.originalFields) {
        if (!field.visible || field.inputMode !== 'scalar-gradient' || !field.showContours) {
          continue
        }
        this.renderScalarContours(field, showOriginal, showTransformed, isOverlayComparison)
      }

      // 1.5. Vector field streamlines (RK4 integral curves behind arrows)
      if (scene.options.showStreamlines && scene.streamlines.length > 0) {
        this.renderStreamlines(scene.streamlines, showOriginal, showTransformed, isOverlayComparison)
      }

      // 2. Vector fields (drawn behind discrete geometry so shapes/vectors remain crisp)
      if (showOriginal) {
        for (const field of scene.originalFields) {
          if (!field.visible) continue
          this.renderVectorFieldSamples(field, field.originalSamples, {
            isOriginalInOverlay: isOverlayComparison,
            isPrimaryTransformed: false,
            labelSuffix: '',
          })
        }
      }

      if (showTransformed) {
        for (const field of scene.transformedFields) {
          if (!field.visible) continue
          if (field.singularPushforwardUnavailable && field.transformedSamples.length === 0) {
            continue
          }
          this.renderVectorFieldSamples(field, field.transformedSamples, {
            isOriginalInOverlay: false,
            isPrimaryTransformed: true,
            labelSuffix: "'",
          })
        }
      }

      // 3. Unit square & transformed area parallelogram
      if (scene.options.showUnitSquare) {
        this.renderUnitSquareOverlay(scene, showOriginal, showTransformed, isOverlayComparison)
      }

      // 3.5. SVD unit circle -> ellipse & singular vectors (v1, v2 -> sigma1*u1, sigma2*u2)
      if (scene.svdGeometry.enabled) {
        this.renderSvdGeometry(scene, showOriginal, showTransformed, isOverlayComparison)
      }

      // 4. Geometric objects
      if (showOriginal) {
        for (const item of scene.originalGeometry) {
          if (!item.visible) continue
          this.renderGeometryItem(item, {
            isOriginalInOverlay: isOverlayComparison,
            isPrimaryTransformed: false,
            labelSuffix: '',
          })
        }
      }

      if (showTransformed) {
        for (const item of scene.transformedGeometry) {
          if (!item.visible) continue
          this.renderGeometryItem(item, {
            isOriginalInOverlay: false,
            isPrimaryTransformed: true,
            labelSuffix: isOverlayComparison ? "'" : '',
          })
        }
      }

      // 5. Standard Basis Vectors e1, e2 and transformed Ae1, Ae2
      if (scene.options.showBasisVectors) {
        this.renderBasisVectors(scene, showOriginal, showTransformed, isOverlayComparison)
      }

      // 6. Persistent Interactive Drag Handles (basis tips, original points, vector tips)
      this.reconcileInteractiveHandles(scene, showOriginal, showTransformed)
    } finally {
      this.board.unsuspendUpdate()
    }
  }

  private renderTransformedGrid(lines: readonly EvaluatedGridLine[]): void {
    if (!this.board) return
    const minorXs: number[] = []
    const minorYs: number[] = []
    const axisXs: number[] = []
    const axisYs: number[] = []

    for (const line of lines) {
      if (line.isAxis) {
        axisXs.push(line.p1[0], line.p2[0], Number.NaN)
        axisYs.push(line.p1[1], line.p2[1], Number.NaN)
      } else {
        minorXs.push(line.p1[0], line.p2[0], Number.NaN)
        minorYs.push(line.p1[1], line.p2[1], Number.NaN)
      }
    }

    if (minorXs.length > 0) {
      const minorGrid = this.board.create('curve', [minorXs, minorYs], {
        strokeColor: '#38bdf8',
        strokeWidth: 1,
        strokeOpacity: 0.22,
        fixed: true,
        highlight: false,
      })
      this.trackElement(minorGrid)
    }

    if (axisXs.length > 0) {
      const warpedAxes = this.board.create('curve', [axisXs, axisYs], {
        strokeColor: '#38bdf8',
        strokeWidth: 1.5,
        strokeOpacity: 0.48,
        fixed: true,
        highlight: false,
      })
      this.trackElement(warpedAxes)
    }
  }

  private renderStreamlines(
    streamlines: readonly EvaluatedStreamlines[],
    showOriginal: boolean,
    showTransformed: boolean,
    isOverlayComparison: boolean,
  ): void {
    if (!this.board) return

    for (const stream of streamlines) {
      if (!stream.visible) continue

      if (showOriginal && stream.originalPaths.length > 0) {
        const xs: number[] = []
        const ys: number[] = []
        for (const path of stream.originalPaths) {
          for (const pt of path) {
            xs.push(pt[0])
            ys.push(pt[1])
          }
          xs.push(Number.NaN)
          ys.push(Number.NaN)
        }
        const origCurve = this.board.create('curve', [xs, ys], {
          strokeColor: isOverlayComparison ? '#64748b' : stream.color,
          strokeWidth: isOverlayComparison ? 1.15 : 1.4,
          strokeOpacity: isOverlayComparison ? 0.35 : 0.48,
          dash: isOverlayComparison ? 2 : 0,
          fixed: true,
          highlight: false,
        })
        this.trackElement(origCurve)

        for (const seed of stream.originalSeeds) {
          const marker = this.board.create('point', [seed[0], seed[1]], {
            withLabel: false,
            size: 2.5,
            face: 'd',
            strokeColor: isOverlayComparison ? '#94a3b8' : stream.color,
            fillColor: isOverlayComparison ? '#94a3b8' : stream.color,
            fillOpacity: 0.65,
            fixed: true,
            highlight: false,
          })
          this.trackElement(marker)
        }
      }

      if (showTransformed && stream.transformedPaths.length > 0) {
        const xs: number[] = []
        const ys: number[] = []
        for (const path of stream.transformedPaths) {
          for (const pt of path) {
            xs.push(pt[0])
            ys.push(pt[1])
          }
          xs.push(Number.NaN)
          ys.push(Number.NaN)
        }
        const transCurve = this.board.create('curve', [xs, ys], {
          strokeColor: stream.color,
          strokeWidth: 1.5,
          strokeOpacity: 0.44,
          fixed: true,
          highlight: false,
        })
        this.trackElement(transCurve)

        for (const seed of stream.transformedSeeds) {
          const marker = this.board.create('point', [seed[0], seed[1]], {
            withLabel: false,
            size: 3,
            face: 'd',
            strokeColor: '#f8fafc',
            fillColor: stream.color,
            fillOpacity: 0.9,
            fixed: true,
            highlight: false,
          })
          this.trackElement(marker)
        }
      }
    }
  }

  private snapDragCoord(val: number): number {
    const step = this.shiftHeld ? 0.25 : 0.05
    return Number((Math.round(val / step) * step).toFixed(4))
  }

  private reconcileInteractiveHandles(
    scene: EvaluatedScene,
    showOriginal: boolean,
    showTransformed: boolean,
  ): void {
    if (!this.board) return
    const specs: DesiredHandleSpec[] = []

    if (scene.options.showBasisVectors && showTransformed && this.callbacks.onBasisDrag) {
      const cb = this.callbacks.onBasisDrag
      specs.push({
        key: 'basis:e1',
        position: scene.basisVectors.transformedE1,
        color: '#ef4444',
        size: 6,
        label: '',
        onDrag: (pos) => cb('e1', pos),
      })
      specs.push({
        key: 'basis:e2',
        position: scene.basisVectors.transformedE2,
        color: '#22c55e',
        size: 6,
        label: '',
        onDrag: (pos) => cb('e2', pos),
      })
    }

    if (showOriginal) {
      for (const item of scene.originalGeometry) {
        if (!item.visible) continue
        if (item.kind === 'point' && this.callbacks.onPointDrag) {
          const cb = this.callbacks.onPointDrag
          const objId = item.id
          specs.push({
            key: `point:${objId}`,
            position: item.position,
            color: item.color,
            size: 6,
            label: '',
            onDrag: (pos) => cb(objId, pos),
          })
        } else if (item.kind === 'vector' && this.callbacks.onVectorTipDrag) {
          const cb = this.callbacks.onVectorTipDrag
          const objId = item.id
          specs.push({
            key: `vec-tip:${objId}`,
            position: item.tip,
            color: item.color,
            size: 5,
            label: '',
            onDrag: (pos) => cb(objId, pos),
          })
        }
      }
    }

    const desiredKeys = new Set(specs.map((s) => s.key))

    // Remove stale handles (unless currently being dragged)
    for (const [key, entry] of this.interactiveHandles.entries()) {
      if (!desiredKeys.has(key) && this.activeDragHandleKey !== key) {
        this.board.removeObject(entry.point)
        this.interactiveHandles.delete(key)
      }
    }

    // Create or update desired handles
    for (const spec of specs) {
      const existing = this.interactiveHandles.get(spec.key)
      if (existing) {
        existing.onDrag = spec.onDrag
        if (this.activeDragHandleKey !== spec.key) {
          existing.point.moveTo([spec.position[0], spec.position[1]], 0)
          existing.point.setAttribute({
            strokeColor: spec.color,
            fillColor: spec.color,
          })
        }
        continue
      }

      const pt = this.board.create('point', [spec.position[0], spec.position[1]], {
        name: spec.label,
        withLabel: false,
        size: spec.size,
        face: 'o',
        layer: 9,
        strokeColor: spec.color,
        strokeWidth: 2.5,
        fillColor: spec.color,
        fillOpacity: 0.35,
        highlightStrokeColor: '#ffffff',
        highlightFillColor: spec.color,
        highlightFillOpacity: 0.65,
        fixed: false,
        highlight: true,
        showInfobox: true,
      })

      const entry = { point: pt, onDrag: spec.onDrag }
      this.interactiveHandles.set(spec.key, entry)

      pt.on('down', () => {
        this.activeDragHandleKey = spec.key
      })

      pt.on('drag', () => {
        const currentEntry = this.interactiveHandles.get(spec.key)
        if (!currentEntry) return
        const nx = this.snapDragCoord(pt.X())
        const ny = this.snapDragCoord(pt.Y())
        currentEntry.onDrag([nx, ny])
      })

      pt.on('up', () => {
        if (this.activeDragHandleKey === spec.key) {
          this.activeDragHandleKey = null
          pt.moveTo([this.snapDragCoord(pt.X()), this.snapDragCoord(pt.Y())], 0)
        }
      })
    }
  }

  private renderEigenvectorLines(scene: EvaluatedScene): void {
    if (!this.board) return
    const pairs = scene.activeStepAnalysis.eigen.realPairs
    const eigenColors = ['#f59e0b', '#ec4899']

    pairs.forEach((pair, idx) => {
      if (!this.board) return
      const [vx, vy] = pair.eigenvector
      if (Math.hypot(vx, vy) < 1e-7) return

      const color = eigenColors[idx % eigenColors.length] ?? '#f59e0b'
      const line = this.board.create(
        'line',
        [
          [0, 0],
          [vx, vy],
        ],
        {
          strokeColor: color,
          strokeWidth: 1.5,
          dash: 3,
          strokeOpacity: 0.7,
          fixed: true,
          highlight: false,
          withLabel: true,
          name: `v${idx + 1} (λ=${Number(pair.eigenvalue.toFixed(2))})`,
          label: {
            strokeColor: color,
            fontSize: 11,
            offset: [8, 8],
          },
        },
      )
      this.trackElement(line)
    })
  }

  private renderSubspaces(scene: EvaluatedScene): void {
    if (!this.board) return
    const { rank, subspaces } = scene.activeStepAnalysis
    if (rank === 2) return

    if (rank === 1 && subspaces.nullBasis) {
      const [nx, ny] = subspaces.nullBasis
      if (Math.hypot(nx, ny) > 1e-7) {
        const nullLine = this.board.create(
          'line',
          [
            [0, 0],
            [nx, ny],
          ],
          {
            strokeColor: '#fb923c',
            strokeWidth: 2.2,
            dash: 2,
            strokeOpacity: 0.88,
            fixed: true,
            highlight: false,
            withLabel: true,
            name: 'Null(M) → 0',
            label: {
              strokeColor: '#fb923c',
              fontSize: 11,
              offset: [10, -14],
            },
          },
        )
        this.trackElement(nullLine)
      }
    }

    if (rank === 1 && subspaces.columnBasis) {
      const [cx, cy] = subspaces.columnBasis
      if (Math.hypot(cx, cy) > 1e-7) {
        const colLine = this.board.create(
          'line',
          [
            [0, 0],
            [cx, cy],
          ],
          {
            strokeColor: '#22d3ee',
            strokeWidth: 2.8,
            dash: 0,
            strokeOpacity: 0.92,
            fixed: true,
            highlight: false,
            withLabel: true,
            name: 'Col(M)',
            label: {
              strokeColor: '#22d3ee',
              fontSize: 12,
              offset: [10, 10],
            },
          },
        )
        this.trackElement(colLine)
      }
    }

    // Highlight origin (0, 0) as the collapse target of Null(M)
    const originTarget = this.board.create('point', [0, 0], {
      name: rank === 0 ? 'Col(M) = {(0,0)} | Null(M) = ℝ²' : '',
      withLabel: rank === 0,
      size: rank === 0 ? 5.5 : 4,
      face: 'o',
      strokeColor: '#fb923c',
      strokeWidth: 2.2,
      fillColor: '#090d16',
      fillOpacity: 0.85,
      fixed: true,
      highlight: false,
      label: {
        strokeColor: '#fb923c',
        fontSize: 11,
        offset: [10, 10],
      },
    })
    this.trackElement(originTarget)
  }

  private renderUnitSquareOverlay(
    scene: EvaluatedScene,
    showOriginal: boolean,
    showTransformed: boolean,
    isOverlayComparison: boolean,
  ): void {
    if (!this.board) return

    if (showOriginal) {
      const sq = scene.basisVectors.originalUnitSquare
      const xs = [...sq.map((p) => p[0]), sq[0][0]]
      const ys = [...sq.map((p) => p[1]), sq[0][1]]
      const curve = this.board.create('curve', [xs, ys], {
        strokeColor: '#94a3b8',
        strokeWidth: 1.2,
        dash: 2,
        strokeOpacity: isOverlayComparison ? 0.45 : 0.75,
        fillColor: '#94a3b8',
        fillOpacity: isOverlayComparison ? 0.05 : 0.1,
        fixed: true,
        highlight: false,
      })
      this.trackElement(curve)
    }

    if (showTransformed) {
      const para = scene.basisVectors.transformedUnitParallelogram
      const xs = [...para.map((p) => p[0]), para[0][0]]
      const ys = [...para.map((p) => p[1]), para[0][1]]
      const reversed = scene.activeStepAnalysis.orientation === 'reversed'
      const fillColor = reversed ? '#f43f5e' : '#10b981'

      const curve = this.board.create('curve', [xs, ys], {
        strokeColor: fillColor,
        strokeWidth: 1.5,
        dash: 1,
        strokeOpacity: 0.7,
        fillColor,
        fillOpacity: 0.12,
        fixed: true,
        highlight: false,
      })
      this.trackElement(curve)
    }
  }

  private renderSvdGeometry(
    scene: EvaluatedScene,
    showOriginal: boolean,
    showTransformed: boolean,
    isOverlayComparison: boolean,
  ): void {
    if (!this.board) return
    const svdGeom = scene.svdGeometry

    if (showOriginal && svdGeom.unitCirclePoints.length > 0) {
      const xs = svdGeom.unitCirclePoints.map((p) => p[0])
      const ys = svdGeom.unitCirclePoints.map((p) => p[1])
      const circle = this.board.create('curve', [xs, ys], {
        strokeColor: '#a78bfa',
        strokeWidth: 1.6,
        dash: isOverlayComparison ? 2 : 0,
        strokeOpacity: isOverlayComparison ? 0.55 : 0.85,
        fillColor: '#a78bfa',
        fillOpacity: isOverlayComparison ? 0.03 : 0.06,
        fixed: true,
        highlight: false,
      })
      this.trackElement(circle)

      this.createVectorArrow([0, 0], svdGeom.v1, {
        color: '#a78bfa',
        width: 2,
        dash: isOverlayComparison ? 2 : 0,
        opacity: isOverlayComparison ? 0.72 : 0.95,
        label: 'v₁',
      })
      this.createVectorArrow([0, 0], svdGeom.v2, {
        color: '#c084fc',
        width: 2,
        dash: isOverlayComparison ? 2 : 0,
        opacity: isOverlayComparison ? 0.65 : 0.9,
        label: 'v₂',
      })
    }

    if (showTransformed && svdGeom.transformedEllipsePoints.length > 0) {
      const xs = svdGeom.transformedEllipsePoints.map((p) => p[0])
      const ys = svdGeom.transformedEllipsePoints.map((p) => p[1])
      const ellipse = this.board.create('curve', [xs, ys], {
        strokeColor: '#e879f9',
        strokeWidth: 2,
        strokeOpacity: 0.92,
        fillColor: '#e879f9',
        fillOpacity: 0.07,
        fixed: true,
        highlight: false,
      })
      this.trackElement(ellipse)

      if (Math.hypot(svdGeom.scaledU1[0], svdGeom.scaledU1[1]) > 1e-4) {
        this.createVectorArrow([0, 0], svdGeom.scaledU1, {
          color: '#e879f9',
          width: 2.6,
          dash: 0,
          opacity: 0.96,
          label: 'σ₁u₁',
        })
      }
      if (Math.hypot(svdGeom.scaledU2[0], svdGeom.scaledU2[1]) > 1e-4) {
        this.createVectorArrow([0, 0], svdGeom.scaledU2, {
          color: '#f472b6',
          width: 2.2,
          dash: 0,
          opacity: 0.9,
          label: 'σ₂u₂',
        })
      }
    }
  }

  private renderBasisVectors(
    scene: EvaluatedScene,
    showOriginal: boolean,
    showTransformed: boolean,
    isOverlayComparison: boolean,
  ): void {
    if (!this.board) return
    const { originalE1, originalE2, transformedE1, transformedE2 } = scene.basisVectors

    if (showOriginal) {
      this.createVectorArrow([0, 0], originalE1, {
        color: '#ef4444',
        width: isOverlayComparison ? 2 : 3,
        dash: isOverlayComparison ? 2 : 0,
        opacity: isOverlayComparison ? 0.45 : 0.95,
        label: 'e₁',
      })
      this.createVectorArrow([0, 0], originalE2, {
        color: '#22c55e',
        width: isOverlayComparison ? 2 : 3,
        dash: isOverlayComparison ? 2 : 0,
        opacity: isOverlayComparison ? 0.45 : 0.95,
        label: 'e₂',
      })
    }

    if (showTransformed) {
      this.createVectorArrow([0, 0], transformedE1, {
        color: '#ef4444',
        width: 3.2,
        dash: 0,
        opacity: 1,
        label: isOverlayComparison ? "A·e₁" : 'e₁',
      })
      this.createVectorArrow([0, 0], transformedE2, {
        color: '#22c55e',
        width: 3.2,
        dash: 0,
        opacity: 1,
        label: isOverlayComparison ? "A·e₂" : 'e₂',
      })
    }
  }

  private renderScalarContours(
    field: EvaluatedVectorField,
    showOriginal: boolean,
    showTransformed: boolean,
    isOverlayComparison: boolean,
  ): void {
    if (!this.board) return

    const drawSegments = (
      segments: readonly Vec2[][],
      strokeColor: string,
      strokeWidth: number,
      strokeOpacity: number,
      dash: number,
    ): void => {
      if (!this.board || segments.length === 0) return
      const xs: number[] = []
      const ys: number[] = []
      for (const seg of segments) {
        for (const pt of seg) {
          xs.push(pt[0])
          ys.push(pt[1])
        }
        xs.push(Number.NaN)
        ys.push(Number.NaN)
      }
      if (xs.length === 0) return
      const curve = this.board.create('curve', [xs, ys], {
        strokeColor,
        strokeWidth,
        strokeOpacity,
        dash,
        fixed: true,
        highlight: false,
        layer: 2,
      })
      this.trackElement(curve)
    }

    if (showOriginal && field.originalContourPaths.length > 0) {
      drawSegments(
        field.originalContourPaths,
        isOverlayComparison ? '#94a3b8' : '#38bdf8',
        isOverlayComparison ? 1.25 : 1.5,
        isOverlayComparison ? 0.36 : 0.62,
        isOverlayComparison ? 2 : 0,
      )
    }

    if (
      showTransformed &&
      !field.singularPushforwardUnavailable &&
      field.transformedContourPaths.length > 0
    ) {
      drawSegments(field.transformedContourPaths, '#fbbf24', 1.55, 0.56, 0)
    }
  }

  private renderVectorFieldSamples(
    field: EvaluatedVectorField,
    samples: readonly EvaluatedVectorSample[],
    style: GeometryRenderStyle,
  ): void {
    if (!this.board || samples.length === 0) return

    const canColorHeatmap =
      !style.isOriginalInOverlay &&
      field.colorOverlay !== 'none' &&
      (field.colorOverlay !== 'scalar' || field.scalarRange !== null)

    if (!canColorHeatmap) {
      const xs: number[] = []
      const ys: number[] = []
      for (const sample of samples) {
        appendSampleArrow(sample, xs, ys)
      }
      if (xs.length === 0) return

      const strokeColor = style.isOriginalInOverlay ? '#64748b' : field.color
      const strokeOpacity = style.isOriginalInOverlay ? 0.45 : 0.92
      const strokeWidth = style.isOriginalInOverlay
        ? Math.max(1.1, field.strokeWidth * 0.75)
        : field.strokeWidth

      const fieldCurve = this.board.create('curve', [xs, ys], {
        strokeColor,
        strokeOpacity,
        strokeWidth,
        dash: style.isOriginalInOverlay ? 1 : 0,
        fixed: true,
        highlight: false,
      })
      this.trackElement(fieldCurve)
      return
    }

    // Heatmap color-banded rendering for divergence, curl, or scalar potential
    const bandColors =
      field.colorOverlay === 'scalar'
        ? ['#38bdf8', '#60a5fa', '#94a3b8', '#f59e0b', '#fbbf24']
        : ['#f43f5e', '#fb7185', '#94a3b8', '#38bdf8', '#2dd4bf']

    const haloX: number[][] = [[], [], [], [], []]
    const haloY: number[][] = [[], [], [], [], []]
    const arrowX: number[][] = [[], [], [], [], []]
    const arrowY: number[][] = [[], [], [], [], []]

    const [halfW, halfH] = estimateHeatmapCellHalfSize(samples)

    for (const sample of samples) {
      const u = normalizeOverlayValue(sample, field)
      const bandIdx = u < -0.45 ? 0 : u < -0.1 ? 1 : u <= 0.1 ? 2 : u <= 0.45 ? 3 : 4
      const [x0, y0] = sample.position

      haloX[bandIdx]!.push(
        x0 - halfW,
        x0 + halfW,
        x0 + halfW,
        x0 - halfW,
        x0 - halfW,
        Number.NaN,
      )
      haloY[bandIdx]!.push(
        y0 - halfH,
        y0 - halfH,
        y0 + halfH,
        y0 + halfH,
        y0 - halfH,
        Number.NaN,
      )

      appendSampleArrow(sample, arrowX[bandIdx]!, arrowY[bandIdx]!)
    }

    for (let b = 0; b < 5; b++) {
      const bandColor = bandColors[b]!
      if (haloX[b]!.length > 0) {
        const tileCurve = this.board.create('curve', [haloX[b]!, haloY[b]!], {
          strokeWidth: 0,
          strokeOpacity: 0,
          fillColor: bandColor,
          fillOpacity: b === 2 ? 0.06 : 0.16,
          fixed: true,
          highlight: false,
          layer: 1,
        })
        this.trackElement(tileCurve)
      }

      if (arrowX[b]!.length > 0) {
        const bandArrows = this.board.create('curve', [arrowX[b]!, arrowY[b]!], {
          strokeColor: bandColor,
          strokeOpacity: 0.95,
          strokeWidth: field.strokeWidth,
          fixed: true,
          highlight: false,
        })
        this.trackElement(bandArrows)
      }
    }
  }

  private renderGeometryItem(item: EvaluatedGeometryItem, style: GeometryRenderStyle): void {
    switch (item.kind) {
      case 'point':
        this.renderPoint(item, style)
        break
      case 'vector':
        this.renderVector(item, style)
        break
      case 'line':
        this.renderLine(item, style)
        break
      case 'polygon':
        this.renderPolygon(item, style)
        break
      case 'curve':
        this.renderCurve(item, style)
        break
    }
  }

  private renderPoint(item: EvaluatedPointGeometry, style: GeometryRenderStyle): void {
    if (!this.board) return
    const [x, y] = item.position
    const color = style.isOriginalInOverlay ? '#94a3b8' : item.color
    const pt = this.board.create('point', [x, y], {
      name: `${item.name}${style.labelSuffix}`,
      size: style.isOriginalInOverlay ? 3 : 4,
      strokeColor: color,
      fillColor: color,
      fillOpacity: style.isOriginalInOverlay ? 0.45 : 1,
      strokeOpacity: style.isOriginalInOverlay ? 0.45 : 1,
      fixed: true,
      highlight: false,
      label: {
        strokeColor: color,
        fontSize: 12,
        offset: [8, 8],
      },
    })
    this.trackElement(pt)
  }

  private renderVector(item: EvaluatedVectorGeometry, style: GeometryRenderStyle): void {
    this.createVectorArrow(item.tail, item.tip, {
      color: style.isOriginalInOverlay ? '#94a3b8' : item.color,
      width: style.isOriginalInOverlay ? Math.max(1.5, item.strokeWidth * 0.75) : item.strokeWidth,
      dash: style.isOriginalInOverlay ? 2 : 0,
      opacity: style.isOriginalInOverlay ? 0.45 : 0.98,
      label: `${item.name}${style.labelSuffix}`,
    })
  }

  private renderLine(item: EvaluatedLineGeometry, style: GeometryRenderStyle): void {
    if (!this.board) return
    const color = style.isOriginalInOverlay ? '#94a3b8' : item.color

    if (item.degeneratePoint) {
      const pt = this.board.create('point', [item.p1[0], item.p1[1]], {
        name: `${item.name}${style.labelSuffix} (collapsed)`,
        size: 3,
        strokeColor: color,
        fillColor: color,
        fixed: true,
        highlight: false,
        label: { strokeColor: color, fontSize: 11 },
      })
      this.trackElement(pt)
      return
    }

    const line = this.board.create('line', [[...item.p1], [...item.p2]], {
      straightFirst: item.infinite,
      straightLast: item.infinite,
      strokeColor: color,
      strokeWidth: style.isOriginalInOverlay ? 1.5 : item.strokeWidth,
      strokeOpacity: style.isOriginalInOverlay ? 0.45 : 0.95,
      dash: style.isOriginalInOverlay ? 2 : 0,
      fixed: true,
      highlight: false,
      withLabel: true,
      name: `${item.name}${style.labelSuffix}`,
      label: {
        strokeColor: color,
        fontSize: 11,
        offset: [6, 6],
      },
    })
    this.trackElement(line)
  }

  private renderPolygon(item: EvaluatedPolygonGeometry, style: GeometryRenderStyle): void {
    if (!this.board || item.vertices.length === 0) return

    const first = item.vertices[0]
    if (!first) return
    const xs = [...item.vertices.map((v) => v[0]), first[0]]
    const ys = [...item.vertices.map((v) => v[1]), first[1]]
    const color = style.isOriginalInOverlay ? '#94a3b8' : item.color

    const polyCurve = this.board.create('curve', [xs, ys], {
      strokeColor: color,
      strokeWidth: style.isOriginalInOverlay ? 1.6 : item.strokeWidth,
      strokeOpacity: style.isOriginalInOverlay ? 0.5 : 0.95,
      dash: style.isOriginalInOverlay ? 2 : 0,
      fillColor: color,
      fillOpacity: style.isOriginalInOverlay ? item.fillOpacity * 0.35 : item.fillOpacity,
      fixed: true,
      highlight: false,
    })
    this.trackElement(polyCurve)

    // Render vertex dots so degeneracies or corners are clear
    for (const v of item.vertices) {
      const pt = this.board.create('point', [v[0], v[1]], {
        withLabel: false,
        size: style.isOriginalInOverlay ? 1.8 : 2.5,
        strokeColor: color,
        fillColor: color,
        fillOpacity: style.isOriginalInOverlay ? 0.45 : 0.9,
        strokeOpacity: style.isOriginalInOverlay ? 0.45 : 0.9,
        fixed: true,
        highlight: false,
      })
      this.trackElement(pt)
    }
  }

  private renderCurve(item: EvaluatedCurveGeometry, style: GeometryRenderStyle): void {
    if (!this.board || item.points.length === 0) return

    const xs = item.points.map((p) => p[0])
    const ys = item.points.map((p) => p[1])
    const color = style.isOriginalInOverlay ? '#94a3b8' : item.color

    const curve = this.board.create('curve', [xs, ys], {
      strokeColor: color,
      strokeWidth: style.isOriginalInOverlay ? 1.6 : item.strokeWidth,
      strokeOpacity: style.isOriginalInOverlay ? 0.5 : 0.95,
      dash: style.isOriginalInOverlay ? 2 : 0,
      fillColor: item.closed ? color : 'none',
      fillOpacity: item.closed
        ? style.isOriginalInOverlay
          ? item.fillOpacity * 0.35
          : item.fillOpacity
        : 0,
      fixed: true,
      highlight: false,
    })
    this.trackElement(curve)
  }

  private createVectorArrow(
    tail: Vec2,
    tip: Vec2,
    opts: {
      color: string
      width: number
      dash: number
      opacity: number
      label: string
    },
  ): void {
    if (!this.board) return
    const dx = tip[0] - tail[0]
    const dy = tip[1] - tail[1]
    const len = Math.hypot(dx, dy)

    if (len < 1e-6) {
      const pt = this.board.create('point', [tail[0], tail[1]], {
        name: `${opts.label} (0,0)`,
        size: 3,
        strokeColor: opts.color,
        fillColor: opts.color,
        fixed: true,
        highlight: false,
        label: { strokeColor: opts.color, fontSize: 11, offset: [6, 6] },
      })
      this.trackElement(pt)
      return
    }

    const arrow = this.board.create('arrow', [[...tail], [...tip]], {
      strokeColor: opts.color,
      strokeWidth: opts.width,
      strokeOpacity: opts.opacity,
      dash: opts.dash,
      fixed: true,
      highlight: false,
      withLabel: Boolean(opts.label),
      name: opts.label,
      label: {
        position: 'top',
        strokeColor: opts.color,
        fontSize: 12,
        offset: [6, 6],
      },
    })
    this.trackElement(arrow)
  }

  private trackElement(
    el: JXG.GeometryElement | JXG.Composition | JXG.GeometryElement[],
  ): void {
    this.createdElements.push(el)
  }

  private clearDynamicElements(): void {
    if (!this.board) return
    for (let i = this.createdElements.length - 1; i >= 0; i--) {
      const el = this.createdElements[i]
      if (el) {
        this.board.removeObject(el as JXG.GeometryElement)
      }
    }
    this.createdElements = []
  }

  public updateFlowParticles(batch: FlowRenderBatch | null): void {
    if (!this.board) return

    if (!batch) {
      this.flowOrigTrailX = []
      this.flowOrigTrailY = []
      this.flowOrigHeadX = []
      this.flowOrigHeadY = []
      this.flowTransTrailX = []
      this.flowTransTrailY = []
      this.flowTransHeadX = []
      this.flowTransHeadY = []
      this.board.update()
      return
    }

    const headRadius = this.getParticleHeadRadius()
    const [ohx, ohy] = buildHeadDiamonds(batch.originalHeadXs, batch.originalHeadYs, headRadius)
    const [thx, thy] = buildHeadDiamonds(
      batch.transformedHeadXs,
      batch.transformedHeadYs,
      headRadius * 1.15,
    )

    this.flowOrigTrailX = batch.originalTrailXs
    this.flowOrigTrailY = batch.originalTrailYs
    this.flowOrigHeadX = ohx
    this.flowOrigHeadY = ohy

    this.flowTransTrailX = batch.transformedTrailXs
    this.flowTransTrailY = batch.transformedTrailYs
    this.flowTransHeadX = thx
    this.flowTransHeadY = thy

    if (this.flowTransTrailCurve) {
      this.flowTransTrailCurve.setAttribute({ strokeColor: batch.primaryColor })
    }

    this.board.update()
  }

  private getParticleHeadRadius(): number {
    if (!this.board) return 0.06
    const box = this.board.getBoundingBox()
    const spanX = Math.abs(box[2] - box[0])
    return Math.max(0.02, spanX * 0.005)
  }

  public setSeedPlacementMode(enabled: boolean): void {
    this.seedPlacementMode = enabled
    if (this.container) {
      this.container.style.cursor = enabled ? 'crosshair' : ''
    }
  }

  public zoomIn(): void {
    if (!this.board) return
    this.board.zoomIn()
  }

  public zoomOut(): void {
    if (!this.board) return
    this.board.zoomOut()
  }

  public resetView(box: WorldBoundingBox = this.defaultBox): void {
    if (!this.board) return
    this.board.setBoundingBox([...box], true)
  }

  public resize(): void {
    if (!this.board || !this.container) return
    const rect = this.container.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      this.board.resizeContainer(rect.width, rect.height)
    }
  }

  public clear(): void {
    if (!this.board) return
    this.board.suspendUpdate()
    this.clearDynamicElements()
    for (const entry of this.interactiveHandles.values()) {
      this.board.removeObject(entry.point)
    }
    this.interactiveHandles.clear()
    this.activeDragHandleKey = null
    this.board.unsuspendUpdate()
  }

  public destroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('keyup', this.handleKeyUp)
    if (this.container) {
      this.container.removeEventListener('dblclick', this.handleCanvasDoubleClick)
      this.container.removeEventListener('pointerdown', this.handleCanvasPointerDown, true)
      this.container.removeEventListener('pointermove', this.handleCanvasPointerMove)
      this.container.removeEventListener('pointerleave', this.handleCanvasPointerLeave)
      this.container.style.cursor = ''
    }
    this.createdElements = []
    this.interactiveHandles.clear()
    this.activeDragHandleKey = null
    this.flowOrigTrailCurve = null
    this.flowOrigHeadCurve = null
    this.flowTransTrailCurve = null
    this.flowTransHeadCurve = null
    if (this.board) {
      JXG.JSXGraph.freeBoard(this.board)
      this.board = null
    }
    this.container = null
  }
}

function buildHeadDiamonds(
  xs: readonly number[],
  ys: readonly number[],
  r: number,
): [number[], number[]] {
  const outX: number[] = []
  const outY: number[] = []
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i]!
    const y = ys[i]!
    outX.push(x - r, x, x + r, x, x - r, Number.NaN)
    outY.push(y, y + r, y, y - r, y, Number.NaN)
  }
  return [outX, outY]
}

function appendSampleArrow(sample: EvaluatedVectorSample, xs: number[], ys: number[]): void {
  const [x0, y0] = sample.position
  const [dx, dy] = sample.displayDelta
  const len = Math.hypot(dx, dy)
  if (len < 1e-5) return

  const x1 = x0 + dx
  const y1 = y0 + dy

  xs.push(x0, x1, Number.NaN)
  ys.push(y0, y1, Number.NaN)

  const ux = dx / len
  const uy = dy / len
  const nx = -uy
  const ny = ux
  const headLen = Math.min(len * 0.34, 0.22)
  const headHalfWidth = headLen * 0.52

  const leftX = x1 - ux * headLen + nx * headHalfWidth
  const leftY = y1 - uy * headLen + ny * headHalfWidth
  const rightX = x1 - ux * headLen - nx * headHalfWidth
  const rightY = y1 - uy * headLen - ny * headHalfWidth

  xs.push(leftX, x1, rightX, Number.NaN)
  ys.push(leftY, y1, rightY, Number.NaN)
}

function normalizeOverlayValue(
  sample: EvaluatedVectorSample,
  field: EvaluatedVectorField,
): number {
  if (field.colorOverlay === 'divergence') {
    const scale = Math.max(0.5, field.maxAbsDivergence)
    return Math.max(-1, Math.min(1, sample.divergence / scale))
  }
  if (field.colorOverlay === 'curl') {
    const scale = Math.max(0.5, field.maxAbsCurl)
    return Math.max(-1, Math.min(1, sample.curl / scale))
  }
  if (field.colorOverlay === 'scalar' && sample.scalarValue !== null && field.scalarRange) {
    const [sMin, sMax] = field.scalarRange
    const span = sMax - sMin
    if (span < 1e-6) return 0
    return Math.max(-1, Math.min(1, ((sample.scalarValue - sMin) / span) * 2 - 1))
  }
  return 0
}

function estimateHeatmapCellHalfSize(samples: readonly EvaluatedVectorSample[]): [number, number] {
  if (samples.length < 4) return [0.35, 0.35]
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const s of samples) {
    if (s.position[0] < minX) minX = s.position[0]
    if (s.position[0] > maxX) maxX = s.position[0]
    if (s.position[1] < minY) minY = s.position[1]
    if (s.position[1] > maxY) maxY = s.position[1]
  }
  const side = Math.max(2, Math.round(Math.sqrt(samples.length)))
  const spanX = maxX - minX
  const spanY = maxY - minY
  const hw = spanX > 1e-3 ? Math.max(0.14, Math.min(0.58, (spanX / (side - 1)) * 0.44)) : 0.25
  const hh = spanY > 1e-3 ? Math.max(0.14, Math.min(0.58, (spanY / (side - 1)) * 0.44)) : 0.25
  return [hw, hh]
}
