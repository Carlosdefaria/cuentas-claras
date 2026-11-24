// App instalada (PWA en modo standalone): marca <html> con `data-app-instalada` para que index.css quite, solo ahí, la
// vista previa de enlaces de iOS al mantener pulsado (Abrir / Añadir a la lista de lectura / Copiar enlace / Compartir)
// y la selección del texto de botones y enlaces. En Safari se mantiene el comportamiento normal de una web.

import { currentInstallEnv } from './installHelp'

export function markInstalledApp(root: HTMLElement, standalone: boolean): void {
  root.toggleAttribute('data-app-instalada', standalone)
}

export function markInstalledAppFromEnv(): void {
  markInstalledApp(document.documentElement, currentInstallEnv().standalone)
}
