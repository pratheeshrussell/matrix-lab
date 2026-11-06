import type { EvaluatedScene } from '../engine/SceneEvaluator'

/**
 * Bounding box in mathematical world coordinates: [xMin, yMax, xMax, yMin]
 */
export type WorldBoundingBox = readonly [number, number, number, number]

/**
 * Renderer boundary interface.
 * Keeps JSXGraph or any future 3D renderer (e.g. Three.js) completely decoupled
 * from the mathematical domain model and Pinia stores.
 */
export interface Renderer {
  initialize(container: HTMLElement, initialBox?: WorldBoundingBox): void
  render(scene: EvaluatedScene): void
  zoomIn(): void
  zoomOut(): void
  resetView(box?: WorldBoundingBox): void
  resize(): void
  clear(): void
  destroy(): void
}
