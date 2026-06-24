'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { setGlobalLogoutCallback } from '@/lib/sessionManager';

interface SessionMonitorProps {
  children: React.ReactNode;
  onForceLogout?: () => void;
  pathname?: string;
}

interface RoleChangeInfo {
  oldRole: string;
  newRole: string;
  timestamp: Date;
}

export default function SessionMonitor({ children, onForceLogout, pathname }: SessionMonitorProps) {
  const router = useRouter();
  const [showRoleChangeBanner, setShowRoleChangeBanner] = useState(false);
  const [roleChangeInfo, setRoleChangeInfo] = useState<RoleChangeInfo | null>(null);
  const [currentTokenVersion, setCurrentTokenVersion] = useState<number>(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [hasCheckedInitial, setHasCheckedInitial] = useState(false);

  const getStoredUserId = useCallback((): string | null => {
    try {
      const userData = localStorage.getItem('user');
      if (userData) {
        const user = JSON.parse(userData);
        return user.id || null;
      }
    } catch {
      // ignore
    }
    return null;
  }, []);

  const getStoredRole = useCallback((): string | null => {
    try {
      const userData = localStorage.getItem('user');
      if (userData) {
        const user = JSON.parse(userData);
        return user.role || null;
      }
    } catch {
      // ignore
    }
    return null;
  }, []);

  const updateStoredRole = useCallback((newRole: string) => {
    try {
      const userData = localStorage.getItem('user');
      if (userData) {
        const user = JSON.parse(userData);
        user.role = newRole;
        localStorage.setItem('user', JSON.stringify(user));
      }
    } catch {
      // ignore
    }
  }, []);

  const dismissRoleChangeBanner = useCallback(() => {
    setShowRoleChangeBanner(false);
    setRoleChangeInfo(null);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('user');
    router.push('/login');
  }, [router]);

  const checkSession = useCallback(async () => {
    try {
      const storedUserId = getStoredUserId();
      if (!storedUserId) return;

      const response = await api.auth.verifySession();
      
      if (!response.valid) {
        return;
      }

      if (!response.userId) {
        return;
      }

      if (response.userId !== storedUserId) {
        setCurrentTokenVersion(response.tokenVersion ?? 0);
        setCurrentUserId(response.userId ?? null);
        return;
      }

      if (!hasCheckedInitial) {
        setCurrentTokenVersion(response.tokenVersion ?? 0);
        setCurrentUserId(response.userId ?? null);
        setHasCheckedInitial(true);
        return;
      }

      if (response.tokenVersion !== undefined && response.tokenVersion !== currentTokenVersion) {
        const storedRole = getStoredRole();
        const newRole = response.role || storedRole;
        
        setRoleChangeInfo({
          oldRole: storedRole || 'Sconosciuto',
          newRole: newRole || 'Sconosciuto',
          timestamp: new Date()
        });
        setShowRoleChangeBanner(true);
        
        if (storedRole && newRole && storedRole !== newRole) {
          updateStoredRole(newRole);
        }
        
        setCurrentTokenVersion(response.tokenVersion ?? 0);
      }
    } catch {
    }
  }, [currentTokenVersion, getStoredUserId, getStoredRole, updateStoredRole, hasCheckedInitial]);

  useEffect(() => {
    const storedUserId = getStoredUserId();
    setCurrentUserId(storedUserId);
  }, [getStoredUserId]);

  useEffect(() => {
    setGlobalLogoutCallback(() => {
      handleLogout();
    });

    return () => {
      setGlobalLogoutCallback(null);
    };
  }, [handleLogout]);

  useEffect(() => {
    checkSession();
  }, [pathname]);

  const getRoleLabel = (role: string | null | undefined): string => {
    if (!role) return 'Sconosciuto';
    switch (role.toUpperCase()) {
      case 'ADMIN': return 'Amministratore';
      case 'TEACHER': return 'Docente';
      case 'STUDENT': return 'Studente';
      default: return role;
    }
  };

  return (
    <>
      {showRoleChangeBanner && roleChangeInfo && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-50 border-b border-amber-200 shadow-md">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-amber-800">
                  Aggiornamento ruolo
                </p>
                <p className="text-sm text-amber-700">
                  Il tuo ruolo è stato aggiornato da {getRoleLabel(roleChangeInfo.oldRole)} a {getRoleLabel(roleChangeInfo.newRole)}.
                </p>
              </div>
            </div>
            <button
              onClick={dismissRoleChangeBanner}
              className="flex-shrink-0 p-2 rounded-full hover:bg-amber-100 transition-colors"
              aria-label="Chiudi notifica"
            >
              <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
      
      {children}
    </>
  );
}
