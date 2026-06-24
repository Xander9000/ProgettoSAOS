'use client';

import { useEffect, useState } from 'react';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  courseId?: string;
  isRead: boolean;
  createdAt: string;
}

interface NotificationPopupProps {
  notification: Notification | null;
  onClose: () => void;
}

export default function NotificationPopup({ notification, onClose }: NotificationPopupProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (notification) {
      setIsVisible(true);
    }
  }, [notification]);

  if (!notification || !isVisible) return null;

  const isRoleChange = notification.type === 'ROLE_CHANGE';
  const isRemoval = notification.type === 'REMOVAL' || notification.type === 'SESSION_INVALIDATED';

  const getStyles = () => {
    if (isRoleChange) {
      return {
        headerBg: 'bg-amber-50',
        headerBorder: 'border-amber-100',
        iconColor: 'text-amber-600',
        titleColor: 'text-amber-800',
        subtitleColor: 'text-amber-600',
        subtitle: 'Aggiornamento account'
      };
    }
    if (isRemoval) {
      return {
        headerBg: 'bg-red-50',
        headerBorder: 'border-red-100',
        iconColor: 'text-red-600',
        titleColor: 'text-red-800',
        subtitleColor: 'text-red-600',
        subtitle: 'Notifica importante'
      };
    }
    return {
      headerBg: 'bg-blue-50',
      headerBorder: 'border-blue-100',
      iconColor: 'text-blue-600',
      titleColor: 'text-blue-800',
      subtitleColor: 'text-blue-600',
      subtitle: 'Notifica'
    };
  };

  const styles = getStyles();

  const getIcon = () => {
    if (isRoleChange) {
      return (
        <svg className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      );
    }
    if (isRemoval) {
      return (
        <svg className="w-8 h-8 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      );
    }
    return (
      <svg className="w-8 h-8 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md animate-fade-in"
        onClick={onClose}
      />
      <div className="relative bg-slate-900 border border-white/10 rounded-[40px] shadow-2xl max-w-md w-full overflow-hidden animate-fade-in-up">
        <div className={`px-10 py-8 border-b border-white/5 ${
            isRoleChange ? 'bg-amber-500/5' : isRemoval ? 'bg-rose-500/5' : 'bg-cyan-500/5'
        }`}>
          <div className="flex items-center gap-5">
            <div className="p-4 bg-white/5 rounded-2xl">
              {getIcon()}
            </div>
            <div>
              <h3 className="text-2xl font-black text-white tracking-tight leading-tight">{notification.title}</h3>
              <p className={`text-[10px] font-black uppercase tracking-[0.2em] mt-1 ${
                isRoleChange ? 'text-amber-400' : isRemoval ? 'text-rose-400' : 'text-cyan-400'
              }`}>
                {isRoleChange ? 'Sicurezza' : isRemoval ? 'Sistema' : 'Aggiornamento'}
              </p>
            </div>
          </div>
        </div>
        
        <div className="px-10 py-8">
          <p className="text-slate-300 leading-relaxed font-medium">{notification.message}</p>
          <div className="flex items-center gap-2 mt-6 p-3 bg-white/5 rounded-xl border border-white/5">
             <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
             <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">
                {new Date(notification.createdAt).toLocaleString('it-IT', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                })}
             </p>
          </div>
        </div>

        <div className="px-10 py-8 bg-white/5">
          <button
            onClick={onClose}
            className={`w-full font-black py-4 rounded-2xl transition-all active:scale-95 shadow-xl ${
              isRoleChange 
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-900' 
                : 'bg-white hover:bg-slate-200 text-slate-950'
            }`}
          >
            Ho Ricevuto
          </button>
        </div>
      </div>
    </div>
  );
}
