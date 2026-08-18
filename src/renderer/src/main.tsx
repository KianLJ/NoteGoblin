import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { applyFont, applyFontScale, getStoredFontId, getStoredFontScale, initTheme } from './theme'
import './styles/global.css'
import './styles/primitives.css'

initTheme()
applyFont(getStoredFontId())
applyFontScale(getStoredFontScale())

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
