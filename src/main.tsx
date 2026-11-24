import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerServiceWorker } from './pwa/updates'
import { markInstalledAppFromEnv } from './pwa/installedMode'

markInstalledAppFromEnv()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

void registerServiceWorker()
