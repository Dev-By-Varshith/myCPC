import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import './index.css'
import App from './App.jsx'

// IMPORTANT: Replace this with your actual Google Client ID from Google Cloud Console
const GOOGLE_CLIENT_ID = "1055325556276-v1l2f1q6k927mpe1fbl748439mnd4733.apps.googleusercontent.com"; // Placeholder

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  </StrictMode>,
)
