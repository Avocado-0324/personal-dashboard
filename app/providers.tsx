'use client';

import { SessionProvider } from 'next-auth/react';
import { ReactNode } from 'react';
import { ThemeProvider } from '@/lib/theme-context';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider defaultTheme="dark">
        {children}
      </ThemeProvider>
    </SessionProvider>
  );
}
