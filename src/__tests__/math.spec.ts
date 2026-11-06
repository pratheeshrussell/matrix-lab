import { describe, expect, it } from 'vitest'
import {
  IDENTITY_MAT2,
  approxEqualMat2,
  composePipeline,
  determinantMat2,
  inverseMat2,
  multiplyMat2,
  multiplyMat2Vec2,
  projectionMatrix,
  reflectionMatrix,
  rotationMatrix,
  scalingMatrix,
  shearMatrix,
  traceMat2,
  type Mat2,
} from '../domain/math/Matrix2'
import { approxEqualVec2, type Vec2 } from '../domain/math/Vector2'
import { analyzeMatrix2 } from '../engine/MatrixProperties'

describe('Matrix2 and Linear Algebra Engine', () => {
  it('multiplies column vectors on the left: v_prime = A * v', () => {
    const A: Mat2 = [2, 3, 4, 5]
    const v: Vec2 = [1, 2]
    // [2*1 + 3*2, 4*1 + 5*2] = [8, 14]
    expect(multiplyMat2Vec2(A, v)).toEqual([8, 14])
  })

  it('maps standard basis vectors e1=[1,0] and e2=[0,1] to the columns of A', () => {
    const A: Mat2 = [3, -2, 1.5, 4]
    expect(multiplyMat2Vec2(A, [1, 0])).toEqual([3, 1.5])
    expect(multiplyMat2Vec2(A, [0, 1])).toEqual([-2, 4])
  })

  it('composes ordered pipeline steps R -> S -> H as H * S * R', () => {
    const R = rotationMatrix(90) // [0, -1, 1, 0]
    const S = scalingMatrix(2, 3) // [2, 0, 0, 3]
    const H = shearMatrix(1, 0) // [1, 1, 0, 1]

    const composite = composePipeline([R, S, H])
    const expected = multiplyMat2(H, multiplyMat2(S, R))
    expect(approxEqualMat2(composite, expected)).toBe(true)

    const v: Vec2 = [1, 2]
    const sequential = multiplyMat2Vec2(H, multiplyMat2Vec2(S, multiplyMat2Vec2(R, v)))
    const direct = multiplyMat2Vec2(composite, v)
    expect(approxEqualVec2(sequential, direct)).toBe(true)
  })

  it('computes determinant, trace, and inverse accurately and detects singular matrices', () => {
    const A: Mat2 = [4, 7, 2, 6]
    expect(determinantMat2(A)).toBeCloseTo(10)
    expect(traceMat2(A)).toBeCloseTo(10)

    const inv = inverseMat2(A)
    expect(inv).not.toBeNull()
    if (inv) {
      expect(approxEqualMat2(multiplyMat2(A, inv), IDENTITY_MAT2)).toBe(true)
      expect(approxEqualMat2(multiplyMat2(inv, A), IDENTITY_MAT2)).toBe(true)
    }

    const singular = projectionMatrix('x-axis')
    expect(determinantMat2(singular)).toBe(0)
    expect(inverseMat2(singular)).toBeNull()
  })

  it('analyzes eigenvalues, eigenvectors, rank, and orientation', () => {
    // Reflection across y = x has eigenvalues +1 (along (1,1)) and -1 (along (-1,1))
    const refl = reflectionMatrix('line-y-eq-x')
    const reflAnalysis = analyzeMatrix2(refl)
    expect(reflAnalysis.determinant).toBeCloseTo(-1)
    expect(reflAnalysis.orientation).toBe('reversed')
    expect(reflAnalysis.rank).toBe(2)
    expect(reflAnalysis.eigen.kind).toBe('two-distinct-real')
    expect(reflAnalysis.eigen.realPairs).toHaveLength(2)

    // 90 degree rotation has complex conjugate eigenvalues 0 +/- 1i
    const rot90 = rotationMatrix(90)
    const rotAnalysis = analyzeMatrix2(rot90)
    expect(rotAnalysis.eigen.kind).toBe('complex')
    expect(rotAnalysis.eigen.complexPair).toEqual({ real: 0, imagAbs: 1 })

    // Horizontal shear has repeated eigenvalue 1 (defective, 1 eigenvector along x-axis)
    const shear = shearMatrix(2, 0)
    const shearAnalysis = analyzeMatrix2(shear)
    expect(shearAnalysis.eigen.kind).toBe('repeated-real-defective')
    expect(shearAnalysis.eigen.realPairs).toHaveLength(1)
    expect(shearAnalysis.eigen.realPairs[0]?.eigenvalue).toBeCloseTo(1)
  })
})
