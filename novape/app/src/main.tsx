import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import interLatin from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
import App from './App';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/charts.css';
import './styles/screens.css';

// Inter is the fallback on non-Apple platforms (Apple devices use SF Pro via the system stack).
try {
  const inter = new FontFace('Inter', `url(${interLatin}) format('woff2')`, { weight: '100 900', display: 'swap' });
  document.fonts.add(inter);
} catch {
  /* system fonts only */
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
