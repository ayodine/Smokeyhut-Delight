import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Auto-recover from Vite dynamic import chunk mismatches after new production deployments
window.addEventListener('vite:preloadError', (event) => {
  console.warn('[Vite] Chunk preload error detected after new deployment. Auto-reloading for clean assets...');
  event.preventDefault();
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
