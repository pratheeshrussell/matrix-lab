import { compile, type EvalFunction } from 'mathjs/number'

export interface CompiledExpressionResult {
  ok: true
  expression: string
  evaluate: (scope: Record<string, number>) => number
}

export interface CompiledExpressionError {
  ok: false
  expression: string
  error: string
}

export type ExpressionCompilation = CompiledExpressionResult | CompiledExpressionError

const compilationCache = new Map<string, EvalFunction>()

/**
 * Compiles a mathematical expression string (e.g. "-y + 0.5 * x", "sin(x) * cos(y)", "t^2 - 1")
 * using mathjs `compile()` and validates it against a test scope of allowed variables.
 */
export function compileMathExpression(
  rawExpression: string,
  allowedVariables: readonly string[] = ['x', 'y', 't'],
): ExpressionCompilation {
  const trimmed = rawExpression.trim()
  if (!trimmed) {
    return {
      ok: false,
      expression: rawExpression,
      error: 'Expression cannot be empty.',
    }
  }

  try {
    let compiled = compilationCache.get(trimmed)
    if (!compiled) {
      compiled = compile(trimmed)
      if (compilationCache.size > 250) {
        compilationCache.clear()
      }
      compilationCache.set(trimmed, compiled)
    }

    // Dry-run test evaluation at safe sample values to catch unknown identifiers or invalid types
    const testScope: Record<string, number> = {}
    for (const v of allowedVariables) {
      testScope[v] = 0.5
    }
    const testResult: unknown = compiled.evaluate(testScope)
    if (typeof testResult !== 'number' && !isComplexOrNaNNumber(testResult)) {
      return {
        ok: false,
        expression: rawExpression,
        error: 'Expression must evaluate to a scalar number.',
      }
    }

    const fn = compiled
    return {
      ok: true,
      expression: trimmed,
      evaluate: (scope: Record<string, number>): number => {
        try {
          const val: unknown = fn.evaluate(scope)
          if (typeof val === 'number') {
            return val
          }
          return Number.NaN
        } catch {
          return Number.NaN
        }
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid mathematical expression'
    return {
      ok: false,
      expression: rawExpression,
      error: message,
    }
  }
}

function isComplexOrNaNNumber(val: unknown): boolean {
  return typeof val === 'object' && val !== null && 're' in val && 'im' in val
}
