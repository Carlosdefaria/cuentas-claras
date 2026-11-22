// Registro del service worker y aviso de versión nueva. La versión nueva espera hasta que la persona
// pulsa «Actualizar» (no se recarga sola a mitad de un formulario).

import { useSyncExternalStore } from 'react'

let updateReady = false
let updating = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

async function serwist() {
  // Import dinámico: el módulo virtual solo existe dentro de Vite (no en los tests de Vitest).
  const { getSerwist } = await import('virtual:serwist')
  return getSerwist()
}

export async function registerServiceWorker(): Promise<void> {
  // En `npm run dev` no hay sw.js (Serwist desactivado): registrar daría «MIME type» y un rechazo sin capturar.
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return
  const sw = await serwist()
  if (!sw) return
  sw.addEventListener('waiting', () => {
    updateReady = true
    emit()
  })
  // Solo recarga cuando la persona ha pedido actualizar (la primera instalación no recarga).
  sw.addEventListener('controlling', () => {
    if (updating) window.location.reload()
  })
  await sw.register()
  // Una PWA de iOS puede pasar días en segundo plano: al volver, se busca versión nueva.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void sw.update()
  })
}

export async function applyUpdate(): Promise<void> {
  updating = true
  const sw = await serwist()
  sw?.messageSkipWaiting()
}

export function useUpdateReady(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => updateReady,
  )
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    (l) => {
      window.addEventListener('online', l)
      window.addEventListener('offline', l)
      return () => {
        window.removeEventListener('online', l)
        window.removeEventListener('offline', l)
      }
    },
    () => navigator.onLine,
  )
}
