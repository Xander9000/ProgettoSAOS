'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface ForceLogoutContextType {
  forceLogout: boolean;
  setForceLogout: (value: boolean) => void;
  triggerForceLogout: () => void;
}

const ForceLogoutContext = createContext<ForceLogoutContextType | undefined>(undefined);

export function ForceLogoutProvider({ children }: { children: ReactNode }) {
  const [forceLogout, setForceLogout] = useState(false);

  const triggerForceLogout = () => {
    setForceLogout(true);
  };

  return (
    <ForceLogoutContext.Provider value={{ forceLogout, setForceLogout, triggerForceLogout }}>
      {children}
    </ForceLogoutContext.Provider>
  );
}

export function useForceLogout() {
  const context = useContext(ForceLogoutContext);
  if (context === undefined) {
    throw new Error('useForceLogout must be used within a ForceLogoutProvider');
  }
  return context;
}
