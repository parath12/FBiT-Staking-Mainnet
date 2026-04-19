'use client';

import { ReactNode } from 'react';
// Importing this module initialises the Reown AppKit singleton and registers
// the <w3m-modal> custom element in the browser.
import '@/lib/reown';

export function AppKitProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
