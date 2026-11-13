import { compileMathExpression } from '../domain/math/ExpressionParser'
import {
  IDENTITY_MAT2,
  inverseMat2,
  multiplyMat2Vec2,
  type Mat2,
} from '../domain/math/Matrix2'
import type { VectorFieldTransformMode } from '../domain/math/Transform'
import { isFiniteVec2, normVec2, type Vec2 } from '../domain/math/Vector2'
import type { VectorFieldDomain, VectorFieldSceneObject } from '../domain/scene/SceneObject'

export type VectorSamplerFn = (pt: Vec2) => Vec2 | null

export interface CompiledFieldSamplers {
  valid: boolean
  evalOriginal: VectorSamplerFn
  evalTransformed: VectorSamplerFn | null
  domain: VectorFieldDomain
  color: string
  fieldId: string
}

export interface EvaluatedStreamlines {
  fieldId: string
  color: string
  visible: boolean
  originalPaths: Vec2[][]
  transformedPaths: Vec2[][]
  originalSeeds: Vec2[]
  transformedSeeds: Vec2[]
}

const STREAMLINE_GRID_X = 5
const STREAMLINE_GRID_Y = 5
const STREAMLINE_STEP_LEN = 0.14
const STREAMLINE_MAX_HALF_STEPS = 42
const MAX_PARTICLE_TRAIL = 14
const BASE_PARTICLES_PER_FIELD = 56
const MAX_PARTICLE_SPEED = 5.5

/**
 * Compiles P(x,y) and Q(x,y) once and creates continuous evaluation functions
 * for both the original vector field F(x) and the transformed vector field
 * according to the active transformation mode:
 * - 'fixed-samples': G(x) = A * F(x)
 * - 'pushforward':   F'(x') = A * F(A^-1 * x') (null if A is singular)
 */
export function createVectorFieldSamplers(
  field: VectorFieldSceneObject,
  matrix: Mat2 = IDENTITY_MAT2,
  mode: VectorFieldTransformMode = 'pushforward',
): CompiledFieldSamplers {
  const compiledP = compileMathExpression(field.exprP, ['x', 'y'])
  const compiledQ = compileMathExpression(field.exprQ, ['x', 'y'])

  if (!compiledP.ok || !compiledQ.ok) {
    return {
      valid: false,
      evalOriginal: () => null,
      evalTransformed: null,
      domain: field.domain,
      color: field.style.color,
      fieldId: field.id,
    }
  }

  const evalOriginal: VectorSamplerFn = (pt: Vec2): Vec2 | null => {
    const vx = compiledP.evaluate({ x: pt[0], y: pt[1] })
    const vy = compiledQ.evaluate({ x: pt[0], y: pt[1] })
    const v: Vec2 = [vx, vy]
    return isFiniteVec2(v) ? v : null
  }

  let evalTransformed: VectorSamplerFn | null = null
  if (mode === 'fixed-samples') {
    evalTransformed = (pt: Vec2): Vec2 | null => {
      const f = evalOriginal(pt)
      if (!f) return null
      const mapped = multiplyMat2Vec2(matrix, f)
      return isFiniteVec2(mapped) ? mapped : null
    }
  } else {
    const invA = inverseMat2(matrix)
    if (invA) {
      evalTransformed = (targetPt: Vec2): Vec2 | null => {
        const preimage = multiplyMat2Vec2(invA, targetPt)
        const f = evalOriginal(preimage)
        if (!f) return null
        const pushed = multiplyMat2Vec2(matrix, f)
        return isFiniteVec2(pushed) ? pushed : null
      }
    }
  }

  return {
    valid: true,
    evalOriginal,
    evalTransformed,
    domain: field.domain,
    color: field.style.color,
    fieldId: field.id,
  }
}

/**
 * Performs a single 4th-order Runge-Kutta (RK4) integration step for dx/dt = v(x).
 * If `normalizeSpeed` is true, integrates along unit direction v / ||v|| (ideal for streamlines).
 */
export function rk4Step(
  pos: Vec2,
  evalVec: VectorSamplerFn,
  dt: number,
  options: { normalizeSpeed?: boolean; maxSpeed?: number } = {},
): Vec2 | null {
  const sampleDir = (p: Vec2): Vec2 | null => {
    const v = evalVec(p)
    if (!v) return null
    const mag = normVec2(v)
    if (mag < 1e-6) return null
    if (options.normalizeSpeed) {
      return [v[0] / mag, v[1] / mag]
    }
    const maxSpd = options.maxSpeed ?? MAX_PARTICLE_SPEED
    if (mag > maxSpd) {
      const s = maxSpd / mag
      return [v[0] * s, v[1] * s]
    }
    return v
  }

  const k1 = sampleDir(pos)
  if (!k1) return null

  const p2: Vec2 = [pos[0] + 0.5 * dt * k1[0], pos[1] + 0.5 * dt * k1[1]]
  const k2 = sampleDir(p2)
  if (!k2) return null

  const p3: Vec2 = [pos[0] + 0.5 * dt * k2[0], pos[1] + 0.5 * dt * k2[1]]
  const k3 = sampleDir(p3)
  if (!k3) return null

  const p4: Vec2 = [pos[0] + dt * k3[0], pos[1] + dt * k3[1]]
  const k4 = sampleDir(p4)
  if (!k4) return null

  const next: Vec2 = [
    pos[0] + (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
    pos[1] + (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
  ]
  return isFiniteVec2(next) ? next : null
}

function isInsideExpandedDomain(pt: Vec2, domain: VectorFieldDomain, margin = 1.5): boolean {
  return (
    pt[0] >= domain.xMin - margin &&
    pt[0] <= domain.xMax + margin &&
    pt[1] >= domain.yMin - margin &&
    pt[1] <= domain.yMax + margin
  )
}

/**
 * Integrates a smooth streamline passing through `seed` both forward and backward.
 */
export function integrateStreamline(
  seed: Vec2,
  evalVec: VectorSamplerFn,
  domain: VectorFieldDomain,
  stepLen = STREAMLINE_STEP_LEN,
  maxHalfSteps = STREAMLINE_MAX_HALF_STEPS,
): Vec2[] {
  const forward: Vec2[] = []
  let curr: Vec2 = seed
  for (let i = 0; i < maxHalfSteps; i++) {
    const next = rk4Step(curr, evalVec, stepLen, { normalizeSpeed: true })
    if (!next || !isInsideExpandedDomain(next, domain)) break
    forward.push(next)
    curr = next
  }

  const backward: Vec2[] = []
  curr = seed
  for (let i = 0; i < maxHalfSteps; i++) {
    const prev = rk4Step(curr, evalVec, -stepLen, { normalizeSpeed: true })
    if (!prev || !isInsideExpandedDomain(prev, domain)) break
    backward.push(prev)
    curr = prev
  }

  backward.reverse()
  return [...backward, seed, ...forward]
}

function generateDefaultSeeds(domain: VectorFieldDomain): Vec2[] {
  const seeds: Vec2[] = []
  const padX = (domain.xMax - domain.xMin) * 0.08
  const padY = (domain.yMax - domain.yMin) * 0.08
  const x0 = domain.xMin + padX
  const x1 = domain.xMax - padX
  const y0 = domain.yMin + padY
  const y1 = domain.yMax - padY

  for (let ix = 0; ix < STREAMLINE_GRID_X; ix++) {
    const x = x0 + ((x1 - x0) * ix) / (STREAMLINE_GRID_X - 1)
    for (let iy = 0; iy < STREAMLINE_GRID_Y; iy++) {
      const y = y0 + ((y1 - y0) * iy) / (STREAMLINE_GRID_Y - 1)
      seeds.push([x, y])
    }
  }
  return seeds
}

/**
 * Computes static RK4 streamlines for a vector field under the active transformation.
 * For custom user-dropped seeds in 'pushforward' mode, seeds are also mapped via x' = A * x
 * so users can verify directly that pushed-forward trajectories match A(x(t)).
 */
export function computeFieldStreamlines(
  field: VectorFieldSceneObject,
  matrix: Mat2,
  mode: VectorFieldTransformMode,
  customSeeds: readonly Vec2[] = [],
): EvaluatedStreamlines {
  const samplers = createVectorFieldSamplers(field, matrix, mode)
  if (!samplers.valid) {
    return {
      fieldId: field.id,
      color: field.style.color,
      visible: field.visible,
      originalPaths: [],
      transformedPaths: [],
      originalSeeds: [],
      transformedSeeds: [],
    }
  }

  const baseSeeds = generateDefaultSeeds(field.domain)
  const originalSeeds = [...baseSeeds, ...customSeeds]
  const originalPaths: Vec2[][] = []

  for (const seed of originalSeeds) {
    const path = integrateStreamline(seed, samplers.evalOriginal, field.domain)
    if (path.length >= 2) {
      originalPaths.push(path)
    }
  }

  const transformedPaths: Vec2[][] = []
  const mappedCustomSeeds =
    mode === 'pushforward'
      ? customSeeds.map((s) => multiplyMat2Vec2(matrix, s))
      : [...customSeeds]

  if (samplers.evalTransformed) {
    const targetSeeds = [...baseSeeds, ...mappedCustomSeeds]
    for (const seed of targetSeeds) {
      const path = integrateStreamline(seed, samplers.evalTransformed, field.domain, STREAMLINE_STEP_LEN, STREAMLINE_MAX_HALF_STEPS)
      if (path.length >= 2) {
        transformedPaths.push(path)
      }
    }
  }

  return {
    fieldId: field.id,
    color: field.style.color,
    visible: field.visible,
    originalPaths,
    transformedPaths,
    originalSeeds: [...customSeeds],
    transformedSeeds: mappedCustomSeeds,
  }
}

interface FlowParticle {
  pos: Vec2
  trail: Vec2[]
  age: number
  maxAge: number
  anchorSeed: Vec2 | null
}

interface FieldParticleGroup {
  fieldId: string
  color: string
  domain: VectorFieldDomain
  evalOriginal: VectorSamplerFn
  evalTransformed: VectorSamplerFn | null
  originalParticles: FlowParticle[]
  transformedParticles: FlowParticle[]
  signature: string
}

export interface FlowRenderBatch {
  originalTrailXs: number[]
  originalTrailYs: number[]
  originalHeadXs: number[]
  originalHeadYs: number[]
  transformedTrailXs: number[]
  transformedTrailYs: number[]
  transformedHeadXs: number[]
  transformedHeadYs: number[]
  primaryColor: string
}

/**
 * Stateful 60fps RK4 particle advection pool for vector fields.
 * Updates particle trails in-place without triggering Vue reactivity or SVG DOM churn.
 */
export class ParticleFlowEngine {
  private groups: FieldParticleGroup[] = []

  public sync(
    fields: readonly VectorFieldSceneObject[],
    matrix: Mat2,
    mode: VectorFieldTransformMode,
    customSeeds: readonly Vec2[],
  ): void {
    const visibleFields = fields.filter((f) => f.visible)
    const nextGroups: FieldParticleGroup[] = []

    for (const field of visibleFields) {
      const samplers = createVectorFieldSamplers(field, matrix, mode)
      if (!samplers.valid) continue

      const sig = `${field.id}|${field.exprP}|${field.exprQ}|${field.domain.xMin},${field.domain.xMax},${field.domain.yMin},${field.domain.yMax}`
      const existing = this.groups.find((g) => g.signature === sig)

      if (existing) {
        existing.color = field.style.color
        existing.evalOriginal = samplers.evalOriginal
        existing.evalTransformed = samplers.evalTransformed
        this.syncCustomSeedParticles(existing, customSeeds, matrix, mode)
        nextGroups.push(existing)
      } else {
        const group: FieldParticleGroup = {
          fieldId: field.id,
          color: field.style.color,
          domain: { ...field.domain },
          evalOriginal: samplers.evalOriginal,
          evalTransformed: samplers.evalTransformed,
          originalParticles: this.createInitialPool(field.domain, customSeeds),
          transformedParticles: this.createInitialPool(
            field.domain,
            mode === 'pushforward'
              ? customSeeds.map((s) => multiplyMat2Vec2(matrix, s))
              : customSeeds,
          ),
          signature: sig,
        }
        nextGroups.push(group)
      }
    }

    this.groups = nextGroups
  }

  public reset(): void {
    for (const g of this.groups) {
      for (const p of g.originalParticles) {
        const respawn = p.anchorSeed ?? randomPointInDomain(g.domain)
        p.pos = respawn
        p.trail = [respawn]
        p.age = Math.random() * 1.2
      }
      for (const p of g.transformedParticles) {
        const respawn = p.anchorSeed ?? randomPointInDomain(g.domain)
        p.pos = respawn
        p.trail = [respawn]
        p.age = Math.random() * 1.2
      }
    }
  }

  public advance(dtSeconds: number, speedMultiplier = 0.85): void {
    const dt = Math.min(0.045, Math.max(0.001, dtSeconds)) * speedMultiplier

    for (const group of this.groups) {
      this.advanceList(group.originalParticles, group.evalOriginal, group.domain, dt)
      if (group.evalTransformed) {
        this.advanceList(group.transformedParticles, group.evalTransformed, group.domain, dt)
      }
    }
  }

  public buildRenderBatch(showOriginal: boolean, showTransformed: boolean): FlowRenderBatch {
    const originalTrailXs: number[] = []
    const originalTrailYs: number[] = []
    const originalHeadXs: number[] = []
    const originalHeadYs: number[] = []

    const transformedTrailXs: number[] = []
    const transformedTrailYs: number[] = []
    const transformedHeadXs: number[] = []
    const transformedHeadYs: number[] = []

    let primaryColor = '#2dd4bf'

    for (const group of this.groups) {
      primaryColor = group.color

      if (showOriginal) {
        appendParticlesToArrays(
          group.originalParticles,
          originalTrailXs,
          originalTrailYs,
          originalHeadXs,
          originalHeadYs,
        )
      }

      if (showTransformed && group.evalTransformed) {
        appendParticlesToArrays(
          group.transformedParticles,
          transformedTrailXs,
          transformedTrailYs,
          transformedHeadXs,
          transformedHeadYs,
        )
      }
    }

    return {
      originalTrailXs,
      originalTrailYs,
      originalHeadXs,
      originalHeadYs,
      transformedTrailXs,
      transformedTrailYs,
      transformedHeadXs,
      transformedHeadYs,
      primaryColor,
    }
  }

  private createInitialPool(
    domain: VectorFieldDomain,
    customSeeds: readonly Vec2[],
  ): FlowParticle[] {
    const list: FlowParticle[] = []
    for (let i = 0; i < BASE_PARTICLES_PER_FIELD; i++) {
      const pos = randomPointInDomain(domain)
      list.push({
        pos,
        trail: [pos],
        age: Math.random() * 3.0,
        maxAge: 2.6 + Math.random() * 1.8,
        anchorSeed: null,
      })
    }
    for (const seed of customSeeds) {
      list.push({
        pos: seed,
        trail: [seed],
        age: 0,
        maxAge: 4.5,
        anchorSeed: seed,
      })
    }
    return list
  }

  private syncCustomSeedParticles(
    group: FieldParticleGroup,
    customSeeds: readonly Vec2[],
    matrix: Mat2,
    mode: VectorFieldTransformMode,
  ): void {
    const baseOrig = group.originalParticles.filter((p) => p.anchorSeed === null)
    const existingOrigAnchors = group.originalParticles.filter((p) => p.anchorSeed !== null)

    const nextOrigAnchors: FlowParticle[] = customSeeds.map((seed, idx) => {
      const prev = existingOrigAnchors[idx]
      if (
        prev &&
        prev.anchorSeed &&
        Math.abs(prev.anchorSeed[0] - seed[0]) < 1e-6 &&
        Math.abs(prev.anchorSeed[1] - seed[1]) < 1e-6
      ) {
        return prev
      }
      return { pos: seed, trail: [seed], age: 0, maxAge: 4.5, anchorSeed: seed }
    })
    group.originalParticles = [...baseOrig, ...nextOrigAnchors]

    const baseTrans = group.transformedParticles.filter((p) => p.anchorSeed === null)
    const existingTransAnchors = group.transformedParticles.filter((p) => p.anchorSeed !== null)
    const mappedSeeds =
      mode === 'pushforward'
        ? customSeeds.map((s) => multiplyMat2Vec2(matrix, s))
        : customSeeds

    const nextTransAnchors: FlowParticle[] = mappedSeeds.map((seed, idx) => {
      const prev = existingTransAnchors[idx]
      if (
        prev &&
        prev.anchorSeed &&
        Math.abs(prev.anchorSeed[0] - seed[0]) < 1e-6 &&
        Math.abs(prev.anchorSeed[1] - seed[1]) < 1e-6
      ) {
        return prev
      }
      return { pos: seed, trail: [seed], age: 0, maxAge: 4.5, anchorSeed: seed }
    })
    group.transformedParticles = [...baseTrans, ...nextTransAnchors]
  }

  private advanceList(
    particles: FlowParticle[],
    evalVec: VectorSamplerFn,
    domain: VectorFieldDomain,
    dt: number,
  ): void {
    for (const p of particles) {
      p.age += dt
      const next = rk4Step(p.pos, evalVec, dt, { normalizeSpeed: false })
      const movedDist = next ? Math.hypot(next[0] - p.pos[0], next[1] - p.pos[1]) : 0

      if (
        !next ||
        !isInsideExpandedDomain(next, domain, 2.0) ||
        p.age >= p.maxAge ||
        movedDist < 1e-4
      ) {
        const respawn = p.anchorSeed ?? randomPointInDomain(domain)
        p.pos = respawn
        p.trail = [respawn]
        p.age = 0
        continue
      }

      p.pos = next
      p.trail.push(next)
      if (p.trail.length > MAX_PARTICLE_TRAIL) {
        p.trail.shift()
      }
    }
  }
}

function randomPointInDomain(domain: VectorFieldDomain): Vec2 {
  const x = domain.xMin + Math.random() * (domain.xMax - domain.xMin)
  const y = domain.yMin + Math.random() * (domain.yMax - domain.yMin)
  return [x, y]
}

function appendParticlesToArrays(
  particles: readonly FlowParticle[],
  trailXs: number[],
  trailYs: number[],
  headXs: number[],
  headYs: number[],
): void {
  for (const p of particles) {
    if (p.trail.length >= 2) {
      for (const pt of p.trail) {
        trailXs.push(pt[0])
        trailYs.push(pt[1])
      }
      trailXs.push(Number.NaN)
      trailYs.push(Number.NaN)
    }

    // Draw a tiny cross/diamond head marker via trail curve or separate head list
    headXs.push(p.pos[0])
    headYs.push(p.pos[1])
  }
}
