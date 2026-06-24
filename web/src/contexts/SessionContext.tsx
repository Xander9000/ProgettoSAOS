'use client';

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { setGlobalLogoutCallback } from '@/lib/sessionManager';

interface SessionContextType {
  triggerForcedLogout: () => void;
  isForcedLogoutTriggered: boolean;
}

const SessionContext = createContext<SessionContextType | null>(null);

export function useSessionContext() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSessionContext must be used within SessionProvider');
  }
  return context;
}

interface SessionProviderProps {
  children: ReactNode;
  onForcedLogout: () => void;
}

export function SessionProvider({ children, onForcedLogout }: SessionProviderProps) {
  const [isForcedLogoutTriggered, setIsForcedLogoutTriggered] = useState(false);

  const triggerForcedLogout = useCallback(() => {
    if (!isForcedLogoutTriggered) {
      setIsForcedLogoutTriggered(true);
      onForcedLogout();
    }
  }, [isForcedLogoutTriggered, onForcedLogout]);

  useEffect(() => {
    setGlobalLogoutCallback(() => {
      setIsForcedLogoutTriggered(true);
      onForcedLogout();
    });

    return () => {
      setGlobalLogoutCallback(null);
    };
  }, [onForcedLogout]);

  return (
    <SessionContext.Provider value={{ triggerForcedLogout, isForcedLogoutTriggered }}>
      {children}
    </SessionContext.Provider>
  );
}
