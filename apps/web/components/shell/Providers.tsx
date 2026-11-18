'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { reportFailure } from '@/lib/api/backend';
import { ApiError, isUnreachable } from '@/lib/api/client';
import { PackageProvider } from '@/lib/api/package';

/** Server state (TanStack Query) and the current package for the whole app. */
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        // Any failed request can reveal that the API is down, not just the first page load.
        queryCache: new QueryCache({ onError: reportFailure }),
        mutationCache: new MutationCache({ onError: reportFailure }),
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            // Retry only what might succeed on retry: an unreachable API, not a 404 or 409.
            retry: (count, e) => count < 2 && (isUnreachable(e) || (e instanceof ApiError && e.status >= 500)),
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <PackageProvider>{children}</PackageProvider>
    </QueryClientProvider>
  );
}
