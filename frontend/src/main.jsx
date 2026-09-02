import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import App from './App'
import './index.css'
import { registerNativeBack } from './lib/nativeBack'

// In the installed Android app the back swipe arrives here, not as a browser
// back — route it into history so backTrap can close overlays. No-op on web.
registerNativeBack({
  isNative:    () => Capacitor.isNativePlatform(),
  addListener: (event, fn) => CapacitorApp.addListener(event, fn),
  back:        () => window.history.back(),
  minimize:    () => CapacitorApp.minimizeApp(),
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
)
