// Service worker (Serwist). Precachea solo el armazón del build para que la app abra sin conexión
// y muestre el aviso; los datos (Auth y Data API) van siempre por red y nunca se guardan.

import { NetworkOnly, Serwist, type PrecacheEntry, type SerwistGlobalConfig } from 'serwist'
import { isNetworkOnly, navigateFallbackDenylist } from './routes'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: {
    cleanupOutdatedCaches: true,
    // Navegaciones (/, /cuenta, /entrar…): el index.html precacheado, que no lleva datos de usuario.
    navigateFallback: '/index.html',
    navigateFallbackDenylist,
  },
  // La versión nueva espera a que la persona pulse «Actualizar» (mensaje SKIP_WAITING), para no
  // recargar a mitad de un formulario.
  skipWaiting: false,
  clientsClaim: false,
  navigationPreload: false,
  disableDevLogs: true,
  runtimeCaching: [
    {
      matcher: ({ url }) => isNetworkOnly(url, self.location.origin),
      handler: new NetworkOnly(),
    },
  ],
})

serwist.addEventListeners()
