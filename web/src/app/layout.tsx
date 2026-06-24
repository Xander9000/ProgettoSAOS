'use client';

import './globals.css';
import Header from '@/components/Header';
import NotificationPopup from '@/components/NotificationPopup';
import { ForceLogoutProvider } from '@/components/ForceLogoutContext';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  courseId?: string;
  isRead: boolean;
  createdAt: string;
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [removalNotification, setRemovalNotification] = useState<Notification | null>(null);

  const handleRemovalNotification = (notification: Notification) => {
    setRemovalNotification(notification);
  };

  const closeRemovalPopup = () => {
    setRemovalNotification(null);
  };

  useEffect(() => {
    const publicPaths = ['/login', '/register', '/forgot-password', '/reset-password', '/'];
    const isPublicPath = publicPaths.includes(pathname);
    
    async function checkAuth() {
      if (isPublicPath && pathname !== '/') {
        setIsLoading(false);
        return;
      }

      if (pathname === '/') {
        setIsLoading(false);
        return;
      }

      try {
        const sessionData = await api.auth.verifySession();
        
        if (sessionData.valid) {
          if (pathname === '/login' || pathname === '/register' || pathname === '/forgot-password' || pathname === '/reset-password') {
            router.push(`/dashboard/${sessionData.role?.toLowerCase() || 'student'}`);
          } else {
            setIsLoading(false);
          }
        } else {
          router.replace('/login');
        }
      } catch {
        if (!isPublicPath) {
          router.replace('/login');
        } else {
          setIsLoading(false);
        }
      }
    }

    checkAuth();
  }, [pathname, router]);

  if (isLoading) {
    return (
      <html lang="it">
        <body className="bg-gray-100">
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-gray-600">Caricamento...</div>
          </div>
        </body>
      </html>
    );
  }

  const showHeader = !['/login', '/register', '/forgot-password', '/reset-password'].includes(pathname);

  return (
    <html lang="it">
      <body className="bg-gray-100">
        <ForceLogoutProvider>
          {showHeader && <Header onRemovalNotification={handleRemovalNotification} />}
          {children}
          <NotificationPopup 
            notification={removalNotification} 
            onClose={closeRemovalPopup} 
          />
        </ForceLogoutProvider>
      </body>
    </html>
  );
}
