/**
 * 2D Column Vector representation:
 * [ x ]
 * [ y ]
 *
 * Stored as a fixed-length 2-tuple [number, number] so TypeScript's
 * `noUncheckedIndexedAccess` knows v[0] and v[1] are always numbers.
 */
export type Vec2 = readonly [number, number]

export const ZERO_VEC2: Vec2 = [0, 0]
export const BASIS_E1: Vec2 = [1, 0]
export const BASIS_E2: Vec2 = [0, 1]

export function vec2(x: number, y: number): Vec2 {
  return [x, y]
}

export function addVec2(a: Vec2, b: Vec2): Vec2 {
  return [a[0] + b[0], a[1] + b[1]]
}

export function subVec2(a: Vec2, b: Vec2): Vec2 {
  return [a[0] - b[0], a[1] - b[1]]
}

export function scaleVec2(v: Vec2, s: number): Vec2 {
  return [v[0] * s, v[1] * s]
}

export function dotVec2(a: Vec2, b: Vec2): number {
  return a[0] * b[0] + a[1] * b[1]
}

/**
 * 2D scalar cross product (z-component of 3D cross product):
 * a_x * b_y - a_y * b_x
 */
export function crossVec2(a: Vec2, b: Vec2): number {
  return a[0] * b[1] - a[1] * b[0]
}

export function normSqVec2(v: Vec2): number {
  return v[0] * v[0] + v[1] * v[1]
}

export function normVec2(v: Vec2): number {
  return Math.hypot(v[0], v[1])
}

export function distanceVec2(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

export function normalizeVec2(v: Vec2, epsilon = 1e-9): Vec2 {
  const len = Math.hypot(v[0], v[1])
  if (len < epsilon) {
    return [0, 0]
  }
  return [v[0] / len, v[1] / len]
}

export function lerpVec2(a: Vec2, b: Vec2, t: number): Vec2 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

export function approxEqualVec2(a: Vec2, b: Vec2, epsilon = 1e-6): boolean {
  return Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon
}

export function isFiniteVec2(v: Vec2): boolean {
  return Number.isFinite(v[0]) && Number.isFinite(v[1])
}
