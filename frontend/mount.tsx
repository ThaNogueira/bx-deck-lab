import 'vite/modulepreload-polyfill';
import { createRoot } from 'react-dom/client';
import type { ReactNode } from 'react';
import { ErrorBoundary } from './components/ui';
import { bx } from './legacy';

export function mount(page: ReactNode) {
  bx.renderTopbar(null);
  const element = document.getElementById('app');
  if (!element) throw new Error('React page root missing');
  createRoot(element).render(<ErrorBoundary>{page}</ErrorBoundary>);
}
