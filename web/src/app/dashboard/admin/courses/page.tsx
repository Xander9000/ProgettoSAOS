'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getCsrfToken } from '@/lib/api';

interface Course {
  id: string;
  title: string;
  teacherId: string;
  isPublished: boolean;
}

export default function AdminCoursesPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchCourses = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'}/api/courses/all`,
        { credentials: 'include' }
      );
      
      if (response.ok) {
        const data = await response.json();
        setCourses(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async (courseId: string) => {
    setActionLoading(courseId);
    try {
      const csrfToken = getCsrfToken();
      const headers: Record<string, string> = {};
      if (csrfToken) headers['x-csrf-token'] = csrfToken;
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'}/api/courses/${courseId}/publish`,
        {
          method: 'PUT',
          credentials: 'include',
          headers,
        }
      );
      
      if (response.ok) {
        setCourses(courses.map(c => 
          c.id === courseId ? { ...c, isPublished: true } : c
        ));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnpublish = async (courseId: string) => {
    setActionLoading(courseId);
    try {
      const csrfToken = getCsrfToken();
      const headers: Record<string, string> = {};
      if (csrfToken) headers['x-csrf-token'] = csrfToken;
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'}/api/courses/${courseId}/unpublish`,
        {
          method: 'PUT',
          credentials: 'include',
          headers,
        }
      );
      
      if (response.ok) {
        setCourses(courses.map(c => 
          c.id === courseId ? { ...c, isPublished: false } : c
        ));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (courseId: string) => {
    if (!confirm('Sei sicuro di voler eliminare questo corso? Questa azione non può essere annullata.')) {
      return;
    }
    
    setActionLoading(courseId);
    try {
      const csrfToken = getCsrfToken();
      const headers: Record<string, string> = {};
      if (csrfToken) headers['x-csrf-token'] = csrfToken;
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'}/api/courses/${courseId}`,
        {
          method: 'DELETE',
          credentials: 'include',
          headers,
        }
      );
      
      if (response.ok) {
        setCourses(courses.filter(c => c.id !== courseId));
      } else {
        const data = await response.json();
        alert(data.error || 'Errore nell\'eliminazione del corso');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    async function checkAuth() {
      try {
        const sessionData = await api.auth.verifySession();
        
        if (!sessionData.valid) {
          router.replace('/login');
          return;
        }

        if (sessionData.role !== 'ADMIN') {
          router.push(`/dashboard/${sessionData.role?.toLowerCase()}`);
          return;
        }

        fetchCourses();
      } catch (error) {
        router.replace('/login');
      }
    }

    checkAuth();
  }, [router]);

  if (loading) return <div className="p-4 text-slate-300">Caricamento...</div>;

  return (
    <div className="text-slate-200">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white">Gestione Corsi</h1>
        <button
          onClick={() => router.push('/dashboard/admin/create')}
          className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white px-4 py-2 rounded-xl shadow-lg shadow-blue-500/30 transition-all"
        >
          + Crea Corso
        </button>
      </div>
      
      <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-lg shadow-md overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-slate-800/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Titolo</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Docente</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Stato</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {courses.map((course) => (
              <tr key={course.id} className="hover:bg-white/5 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">{course.id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{course.title}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">{course.teacherId}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span className={`px-2 py-1 rounded text-xs ${
                    course.isPublished ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                  }`}>
                    {course.isPublished ? 'Pubblicato' : 'Bozza'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {course.isPublished ? (
                    <button 
                      onClick={() => handleUnpublish(course.id)}
                      disabled={actionLoading === course.id}
                      className="text-yellow-400 hover:text-yellow-300 hover:underline mr-2 disabled:opacity-50 transition-colors"
                    >
                      {actionLoading === course.id ? 'Operazione...' : 'Non Pubblicare'}
                    </button>
                  ) : (
                    <button 
                      onClick={() => handlePublish(course.id)}
                      disabled={actionLoading === course.id}
                      className="text-green-400 hover:text-green-300 hover:underline mr-2 disabled:opacity-50 transition-colors"
                    >
                      {actionLoading === course.id ? 'Operazione...' : 'Pubblica'}
                    </button>
                  )}
                  <button 
                    onClick={() => router.push(`/dashboard/admin/courses/${course.id}/edit`)}
                    className="text-cyan-400 hover:text-cyan-300 hover:underline mr-2 transition-colors"
                  >
                    Modifica
                  </button>
                  <button 
                    onClick={() => handleDelete(course.id)}
                    disabled={actionLoading === course.id}
                    className="text-red-400 hover:text-red-300 hover:underline disabled:opacity-50 transition-colors"
                  >
                    Elimina
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {courses.length === 0 && (
        <p className="text-slate-400">Nessun corso trovato.</p>
      )}
    </div>
  );
}
