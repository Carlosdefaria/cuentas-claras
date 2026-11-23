import { describe, expect, it } from 'vitest'
import { CONFIRMATION, PRODUCTION_PROJECT, checkProductionTarget } from './productionDb.ts'

const prodUrl = 'postgresql://u:p@ep-prod-pooler.example.neon.tech/neondb'
const ok = { env: { NEON_BRANCH: 'production', DATABASE_URL: prodUrl }, projectId: PRODUCTION_PROJECT, confirm: CONFIRMATION }

describe('checkProductionTarget (barreras de db:migrate:production)', () => {
  it('con todo en regla devuelve la URL de production', () => {
    expect(checkProductionTarget(ok)).toBe(prodUrl)
  })

  it('sin .env.local, o apuntando a otra rama, aborta', () => {
    expect(() => checkProductionTarget({ ...ok, env: null })).toThrow(/Falta .env.local/)
    expect(() => checkProductionTarget({ ...ok, env: { ...ok.env, NEON_BRANCH: 'test' } })).toThrow(/no a "production"/)
    expect(() => checkProductionTarget({ ...ok, env: { ...ok.env, NEON_BRANCH: 'baseline-check' } })).toThrow(/no a "production"/)
  })

  it('otro proyecto o sin la confirmación escrita exacta, aborta', () => {
    expect(() => checkProductionTarget({ ...ok, projectId: 'otro-proyecto' })).toThrow(/proyecto/)
    expect(() => checkProductionTarget({ ...ok, confirm: undefined })).toThrow(/CONFIRM_PRODUCTION/)
    expect(() => checkProductionTarget({ ...ok, confirm: 'si' })).toThrow(/CONFIRM_PRODUCTION/)
  })

  it('si la URL coincide con la de test, aborta', () => {
    expect(() => checkProductionTarget({ ...ok, testUrl: 'postgresql://x:y@ep-prod-pooler.example.neon.tech/neondb' })).toThrow(/coincide con la de test/)
    expect(checkProductionTarget({ ...ok, testUrl: 'postgresql://x:y@ep-test-pooler.example.neon.tech/neondb' })).toBe(prodUrl)
  })
})
