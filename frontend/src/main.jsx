import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import './index.css'
import App from './App.jsx'

// IMPORTANT: Google Client ID from Google Cloud Console via .env
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "1074326183927-gmuoa3i3khl9jvhf322us5dq9o4r5eij.apps.googleusercontent.com";

// ── LocalStorage to Cloud Interceptor ──
const originalSetItem = localStorage.setItem;
window.originalSetItem = originalSetItem;
window.currentUserId = null;
const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3002';

localStorage.setItem = function (key, value) {
  originalSetItem.apply(this, arguments);

  if (window.currentUserId && (key.startsWith('cf_') || key.startsWith('ag_'))) {
    fetch(`${BACKEND}/api/users/${window.currentUserId}/kv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value })
    }).catch(e => console.warn('Cloud sync failed:', e));
  }
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  </StrictMode>,
)
