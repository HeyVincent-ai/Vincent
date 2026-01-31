import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { StytchProvider } from '@stytch/react'
import { StytchUIClient } from '@stytch/vanilla-js'
import './index.css'
import App from './App'

const stytchClient = new StytchUIClient(
  import.meta.env.VITE_STYTCH_PUBLIC_TOKEN || ''
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StytchProvider stytch={stytchClient}>
      <App />
    </StytchProvider>
  </StrictMode>,
)
