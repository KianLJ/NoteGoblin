import React from 'react'
import ReactDOM from 'react-dom/client'
import { initTheme } from '@renderer/theme'
import '@renderer/styles/theme.css'
import '@renderer/styles/primitives.css'
import '@renderer/styles/animations.css'
import './viewer.css'
import { App } from './App'

initTheme()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
