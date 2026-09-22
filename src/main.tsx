import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '@/app';
import { ThemeProvider } from '@/features/theme/theme-provider';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('#root not found in index.html');
}

// Node detail is an O(1) arena lookup in the Rust core against an immutable open collection
// (ADR-005), so a cached entry can never go stale while that collection is open. `close`/`reload`
// drop the whole `collectionKeys.all` subtree instead.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false, refetchOnWindowFocus: false } },
});

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
);
