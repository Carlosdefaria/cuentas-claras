import { describe, expect, it } from 'vitest'
import { isNetworkOnly, navigateFallbackDenylist } from './routes'

const app = 'https://cuentas.example'

describe('isNetworkOnly', () => {
  it('Auth y cualquier /api van solo por red', () => {
    for (const path of ['/api', '/api/auth/get-session', '/api/auth/sign-in/email?x=1', '/api/otra']) {
      expect(isNetworkOnly(new URL(path, app), app)).toBe(true)
    }
  })

  it('la Data API (otro origen) va solo por red', () => {
    const url = new URL('https://ep-x.apirest.c-8.eu-central-1.aws.neon.tech/neondb/rest/v1/groups?select=*')
    expect(isNetworkOnly(url, app)).toBe(true)
  })

  it('el armazón de la app no se marca como solo red', () => {
    for (const path of ['/', '/assets/index-abc.js', '/icons/icon-192.png', '/apione', '/grupos/api']) {
      expect(isNetworkOnly(new URL(path, app), app)).toBe(false)
    }
  })
})

describe('navigateFallbackDenylist', () => {
  const denied = (path: string) => navigateFallbackDenylist.some((re) => re.test(path))
  it('excluye /api del index.html precacheado', () => {
    expect(denied('/api')).toBe(true)
    expect(denied('/api/auth/callback')).toBe(true)
    expect(denied('/apione')).toBe(false)
    expect(denied('/cuenta')).toBe(false)
  })
})
