import '@irm/ui/styles.css';
import 'dayjs/locale/zh-cn';

import { ThemeProvider } from '@irm/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import dayjs from 'dayjs';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { router } from './router';

dayjs.locale('zh-cn');
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false } } });
const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
