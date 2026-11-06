import {
  IDENTITY_MAT2,
  projectionMatrix,
  reflectionMatrix,
  rotationMatrix,
  scalingMatrix,
  shearMatrix,
  type Mat2,
  type ProjectionKind,
  type ReflectionKind,
} from './Matrix2'

export type TransformationPresetType =
  | 'rotation'
  | 'scaling'
  | 'reflection'
  | 'shear'
  | 'projection'
  | 'custom'

export interface TransformationStepParams {
  angleDeg: number
  sx: number
  sy: number
  shx: number
  shy: number
  reflectionKind: ReflectionKind
  projectionKind: ProjectionKind
}

/**
 * Single step in the ordered transformation pipeline.
 * Designed with `dimension: '2d-linear'` discriminator so 3x3 homogeneous (`'2d-affine'`)
 * or 3D (`'3d-linear'`) steps can be added cleanly in future phases.
 */
export interface TransformationStep {
  id: string
  dimension: '2d-linear'
  name: string
  type: TransformationPresetType
  enabled: boolean
  params: TransformationStepParams
  matrix: Mat2
}

/**
 * Scene visualization modes required by Section 7 of the specification.
 */
export type VisualizationMode = 'original' | 'overlay' | 'transformed' | 'step-through'

/**
 * Vector-field transformation semantics required by Section 6 of the specification:
 *
 * - 'fixed-samples':
 *     Mode A — Transform vector values at fixed sample coordinates:
 *       G(x) = A * F(x)
 *     Sample positions remain fixed; arrow vectors are multiplied by A.
 *
 * - 'pushforward':
 *     Mode B — Transform the vector field geometrically (pushforward):
 *       F'(x') = A * F(A^-1 * x')
 *     Both positions and vector values are transformed according to the coordinate map x' = A * x.
 */
export type VectorFieldTransformMode = 'fixed-samples' | 'pushforward'

/**
 * For Mode B ('pushforward'), specifies whether samples are evaluated at a uniform
 * target grid x' via inverse pullback A * F(A^-1 * x'), or by pushing the original
 * sample coordinates forward to x' = A * x with vector A * F(x).
 */
export type PushforwardSamplingStyle = 'uniform-target-grid' | 'mapped-sample-points'

export function defaultStepParams(): TransformationStepParams {
  return {
    angleDeg: 45,
    sx: 1.5,
    sy: 1,
    shx: 0.6,
    shy: 0,
    reflectionKind: 'x-axis',
    projectionKind: 'x-axis',
  }
}

export function computeMatrixFromPreset(
  type: TransformationPresetType,
  params: TransformationStepParams,
  fallbackMatrix: Mat2 = IDENTITY_MAT2,
): Mat2 {
  switch (type) {
    case 'rotation':
      return rotationMatrix(params.angleDeg)
    case 'scaling':
      return scalingMatrix(params.sx, params.sy)
    case 'reflection':
      return reflectionMatrix(params.reflectionKind, params.angleDeg)
    case 'shear':
      return shearMatrix(params.shx, params.shy)
    case 'projection':
      return projectionMatrix(params.projectionKind, params.angleDeg)
    case 'custom':
      return fallbackMatrix
  }
}
