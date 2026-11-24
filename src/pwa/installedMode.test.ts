// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { markInstalledApp } from './installedMode'

describe('markInstalledApp', () => {
  it('en la app instalada marca <html> (los estilos quitan la vista previa de enlaces de iOS)', () => {
    const root = document.createElement('html')
    markInstalledApp(root, true)
    expect(root.hasAttribute('data-app-instalada')).toBe(true)
  })

  it('en el navegador (Safari) no marca nada: se conserva el comportamiento normal de una web', () => {
    const root = document.createElement('html')
    markInstalledApp(root, false)
    expect(root.hasAttribute('data-app-instalada')).toBe(false)
  })
})
