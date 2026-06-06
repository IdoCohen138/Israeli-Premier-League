import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import './index.css'
import App from './App.tsx'
import { registerServiceWorker, setupPwaLaunchHandler } from './lib/pwa.ts'

registerServiceWorker()
setupPwaLaunchHandler()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
