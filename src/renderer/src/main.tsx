import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { applyFont, getStoredFontId, initTheme } from './theme'
import './styles/global.css'
import './styles/primitives.css'

initTheme()
applyFont(getStoredFontId())

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
