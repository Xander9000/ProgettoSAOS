'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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

interface NotificationBellProps {
  onRemovalNotification?: (notification: Notification) => void;
  onRoleChangeNotification?: (notification: Notification) => void;
}

export default function NotificationBell({ onRemovalNotification, onRoleChangeNotification }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const prevNotificationsRef = useRef<Notification[]>([]);
  const hasShownPopupRef = useRef<string>('');
  const lastCheckRef = useRef<string>(new Date(Date.now() - 60000).toISOString());
  const isPollingRef = useRef<boolean>(true);
  const fetchVersionRef = useRef(0);
  const notificationsRef = useRef<Notification[]>([]);

  const fetchNotifications = async () => {
    const version = ++fetchVersionRef.current;
    try {
      const data = await api.notifications.list();
      if (version !== fetchVersionRef.current) return;
      const newUnreadCount = data.unreadCount;
      
      prevNotificationsRef.current = data.notifications;
      notificationsRef.current = data.notifications;
      setNotifications(data.notifications);
      setUnreadCount(newUnreadCount);
      if (data.notifications.length > 0) {
        lastCheckRef.current = data.notifications[0].createdAt;
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  };

  const startLongPolling = useCallback(async () => {
    while (isPollingRef.current) {
      try {
        const data = await api.notifications.stream(lastCheckRef.current);
        
        if (data.notifications && data.notifications.length > 0) {
          const existingIds = new Set(notificationsRef.current.map(n => n.id));
          const newNotifications = data.notifications.filter((n: Notification) => !existingIds.has(n.id));
          
          if (newNotifications.length > 0) {
            const unreadNotifications = newNotifications.filter((n: Notification) => !n.isRead);
            const removalNotification = unreadNotifications.find((n: Notification) => n.type === 'REMOVAL');
            const roleChangeNotification = unreadNotifications.find((n: Notification) => n.type === 'ROLE_CHANGE');
            
            if (removalNotification && hasShownPopupRef.current !== removalNotification.id) {
              hasShownPopupRef.current = removalNotification.id;
              if (onRemovalNotification) {
                onRemovalNotification(removalNotification);
              }
            }
            
            if (roleChangeNotification && hasShownPopupRef.current !== roleChangeNotification.id) {
              hasShownPopupRef.current = roleChangeNotification.id;
              if (onRoleChangeNotification) {
                onRoleChangeNotification(roleChangeNotification);
              }
            }
            
            setNotifications(prev => {
              const next = [...newNotifications, ...prev];
              notificationsRef.current = next;
              return next;
            });
            lastCheckRef.current = data.notifications[0].createdAt;
          }
        }
        
        if (data.unreadCount !== undefined) {
          setUnreadCount(data.unreadCount);
        }
      } catch (err) {
        console.error('Long polling error:', err);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }, [onRemovalNotification, onRoleChangeNotification]);

  useEffect(() => {
    fetchNotifications();
    startLongPolling();
    
    return () => {
      isPollingRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.isRead) {
      try {
        await api.notifications.markAsRead(notification.id);
        setNotifications(prev => {
          const next = prev.map(n => n.id === notification.id ? { ...n, isRead: true } : n);
          notificationsRef.current = next;
          return next;
        });
        setUnreadCount(prev => Math.max(0, prev - 1));
      } catch (err) {
        console.error('Failed to mark notification as read:', err);
      }
    }
    setSelectedNotification(notification);
  };

  const handleCloseDetail = () => {
    setSelectedNotification(null);
  };

  const handleMarkAllAsRead = async () => {
    try {
      await api.notifications.markAllAsRead();
      fetchVersionRef.current++;
      const data = await api.notifications.list();
      notificationsRef.current = data.notifications;
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Adesso';
    if (minutes < 60) return `${minutes}m fa`;
    if (hours < 24) return `${hours}h fa`;
    if (days < 7) return `${days}g fa`;
    return date.toLocaleDateString('it-IT');
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'ENROLLMENT':
        return (
          <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'REMOVAL':
        return (
          <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'MESSAGE':
        return (
          <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        );
      case 'ROLE_CHANGE':
        return (
          <svg className="w-5 h-5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        );
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-300 hover:text-white transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/4 -translate-y-1/4 bg-red-600 rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-3 w-80 bg-slate-900/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden animate-fade-in-up">
          <div className="flex items-center justify-between px-5 py-4 bg-white/5 border-b border-white/5">
            <h3 className="text-xs font-black text-white uppercase tracking-widest">Notifiche</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="text-[10px] font-black text-cyan-400 hover:text-cyan-300 uppercase tracking-tighter"
              >
                Segna tutto come letto
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto custom-scrollbar">
            {notifications.length === 0 ? (
              <div className="px-6 py-12 text-center text-slate-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mx-auto mb-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
                <p className="text-xs font-bold uppercase tracking-widest opacity-50">Nessuna notifica</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`px-5 py-4 border-b border-white/5 hover:bg-white/5 cursor-pointer transition-all duration-200 group ${
                    !notification.isRead ? 'bg-cyan-500/5' : ''
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 mt-1 p-2 bg-white/5 rounded-lg group-hover:scale-110 transition-transform">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm mb-0.5 ${!notification.isRead ? 'font-bold text-white' : 'font-medium text-slate-300'}`}>
                        {notification.title}
                      </p>
                      <p className="text-xs text-slate-500 line-clamp-1 group-hover:text-slate-400 transition-colors">{notification.message}</p>
                      <p className="text-[10px] text-slate-600 font-bold uppercase tracking-tighter mt-2">{formatDate(notification.createdAt)}</p>
                    </div>
                    {!notification.isRead && (
                      <div className="flex-shrink-0 self-center">
                        <div className="w-2 h-2 bg-cyan-500 rounded-full shadow-[0_0_8px_#06b6d4]"></div>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {selectedNotification && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm animate-fade-in"
            onClick={handleCloseDetail}
          />
          <div className="relative bg-slate-900 border border-white/10 rounded-[32px] shadow-2xl max-w-md w-full overflow-hidden animate-fade-in-up">
            <div className={`px-8 py-6 border-b border-white/5 ${
              selectedNotification.type === 'ENROLLMENT' ? 'bg-emerald-500/5' :
              selectedNotification.type === 'REMOVAL' ? 'bg-rose-500/5' :
              selectedNotification.type === 'ROLE_CHANGE' ? 'bg-amber-500/5' : 'bg-cyan-500/5'
            }`}>
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/5 rounded-2xl">
                  {getNotificationIcon(selectedNotification.type)}
                </div>
                <div>
                  <h3 className="text-xl font-black text-white tracking-tight">{selectedNotification.title}</h3>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{formatDate(selectedNotification.createdAt)}</p>
                </div>
              </div>
            </div>
            
            <div className="px-8 py-8">
              <p className="text-slate-300 leading-relaxed text-sm whitespace-pre-wrap">{selectedNotification.message}</p>
            </div>

            <div className="px-8 py-6 bg-white/5 flex justify-end">
              <button
                onClick={handleCloseDetail}
                className="w-full bg-white text-slate-950 font-black py-3 rounded-xl hover:bg-slate-200 transition-all active:scale-95 shadow-xl"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
