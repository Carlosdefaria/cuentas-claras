// Inserta <link rel="preload"> para las fuentes de los rótulos que se ven en la primera pantalla
// (Barlow Condensed 700: marca y títulos). Solo en el build: el nombre final lleva hash.

import type { Plugin } from 'vite'

export function preloadFonts(patterns: RegExp[]): Plugin {
  return {
    name: 'cuentas-claras:preload-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        if (!ctx.bundle) return []
        const files = Object.keys(ctx.bundle).filter((f) => patterns.some((p) => p.test(f)))
        return files.map((file) => ({
          tag: 'link',
          attrs: { rel: 'preload', href: `/${file}`, as: 'font', type: 'font/woff2', crossorigin: '' },
          injectTo: 'head' as const,
        }))
      },
    },
  }
}
