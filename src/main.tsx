import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter as Router } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import PublicChatWidget from './pages/PublicChatWidget.tsx'

const isWidget = window.location.pathname.startsWith('/widget');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isWidget ? (
      <Router>
        <PublicChatWidget />
      </Router>
    ) : <App />}
  </StrictMode>,
)
