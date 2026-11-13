import type { Vec2 } from '../domain/math/Vector2'
import type { EvaluatedScene } from '../engine/SceneEvaluator'

/**
 * Bounding box in mathematical world coordinates: [xMin, yMax, xMax, yMin]
 */
export type WorldBoundingBox = readonly [number, number, number, number]

export interface RendererInteractionCallbacks {
  onBasisDrag?: (which: 'e1' | 'e2', newPos: Vec2) => void
  onPointDrag?: (objectId: string, newPos: Vec2) => void
  onVectorTipDrag?: (objectId: string, newTipPos: Vec2) => void
}

/**
 * Renderer boundary interface.
 * Keeps JSXGraph or any future 3D renderer (e.g. Three.js) completely decoupled
 * from the mathematical domain model and Pinia stores.
 */
export interface Renderer {
  initialize(
    container: HTMLElement,
    initialBox?: WorldBoundingBox,
    callbacks?: RendererInteractionCallbacks,
  ): void
  render(scene: EvaluatedScene): void
  zoomIn(): void
  zoomOut(): void
  resetView(box?: WorldBoundingBox): void
  resize(): void
  clear(): void
  destroy(): void
}
