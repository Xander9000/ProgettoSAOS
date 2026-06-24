'use client';

import { ReactNode } from 'react';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="p-4">{children}</div>;
}
