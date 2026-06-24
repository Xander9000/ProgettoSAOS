const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081';

interface FetchOptions extends RequestInit {
  skipAuth?: boolean;
}

const CSRF_COOKIE_NAME = 'csrf-token';
const CSRF_HEADER_NAME = 'x-csrf-token';

export function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

function isMutativeMethod(method?: string): boolean {
  const m = (method || 'GET').toUpperCase();
  return m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE';
}

async function fetchApi<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { skipAuth = false, ...fetchOptions } = options;
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...fetchOptions.headers,
  };

  if (isMutativeMethod(fetchOptions.method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      (headers as Record<string, string>)[CSRF_HEADER_NAME] = csrfToken;
    }
  }

  const fetchOptionsFinal: RequestInit = {
    ...fetchOptions,
    headers,
    credentials: 'include' as const,
  };

  try {
    const response = await fetch(`${API_URL}${endpoint}`, fetchOptionsFinal);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Errore di rete' }));
      
      if (response.status === 401 && typeof window !== 'undefined' && !endpoint.includes('/verify-session')) {
        import('./sessionManager').then(({ triggerGlobalLogout }) => {
          triggerGlobalLogout();
        }).catch(() => {});
      }
      
      throw new ApiError(response.status, error.error || 'Errore sconosciuto');
    }

    return response.json();
  } catch (err) {
    throw err;
  }
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      fetchApi<{ user?: { id: string; email: string; role: string }; requires2fa?: boolean; pendingLoginId?: string; message?: string }>('/api/auth/login', {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({ email, password }),
      }),
    requestPasswordReset: (email: string) =>
      fetchApi<{ success: boolean; message: string }>('/api/auth/password-reset/request', {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({ email }),
      }),
    confirmPasswordReset: (token: string, password: string) =>
      fetchApi<{ success: boolean; message: string }>('/api/auth/password-reset/confirm', {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({ token, password }),
      }),
    verify2fa: (pendingLoginId: string, token: string) =>
      fetchApi<{ user: { id: string; email: string; role: string }; message?: string }>('/api/auth/login/verify-2fa', {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({ pendingLoginId, token }),
      }),
    generate2fa: () => fetchApi<{ qrCode: string; secret: string }>('/api/auth/2fa/generate'),
    enable2fa: (token: string) => fetchApi<{ success: boolean }>('/api/auth/2fa/enable', { method: 'POST', body: JSON.stringify({ token }) }),
    disable2fa: (currentPassword: string, token: string) =>
      fetchApi<{ success: boolean }>('/api/auth/2fa/disable', { method: 'POST', body: JSON.stringify({ currentPassword, token }) }),
    
    generateWebauthnRegOptions: () => fetchApi<any>('/api/auth/webauthn/generate-registration-options', { method: 'GET' }),
    verifyWebauthnReg: (body: any) => fetchApi<{ verified: boolean }>('/api/auth/webauthn/verify-registration', { method: 'POST', body: JSON.stringify(body) }),
    generateWebauthnAuthOptions: (email: string) => fetchApi<any>('/api/auth/webauthn/generate-authentication-options', { method: 'POST', skipAuth: true, body: JSON.stringify({ email }) }),
    verifyWebauthnAuth: (email: string, body: any) => fetchApi<{ user: { id: string; email: string; role: string }; message?: string }>('/api/auth/webauthn/verify-authentication', { method: 'POST', skipAuth: true, body: JSON.stringify({ email, body }) }),
    getPasskeys: () => fetchApi<any[]>('/api/auth/passkeys'),
    deletePasskey: (id: string) => fetchApi<{ success: boolean }>(`/api/auth/passkeys/${id}`, { method: 'DELETE' }),
    getSecurityStatus: () => fetchApi<{ twoFactorEnabled: boolean; passkeyCount: number }>('/api/auth/security-status'),
    refresh: () =>
      fetchApi<{ message?: string }>('/api/auth/refresh', {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({}),
      }),
    logout: () =>
      fetchApi<{ success: boolean }>('/api/auth/logout', {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({}),
      }),
    verifySession: () =>
      fetchApi<{ valid: boolean; userId?: string; role?: string; email?: string; tokenVersion?: number; error?: string }>('/api/auth/verify-session'),
  },
  courses: {
    catalog: () => fetchApi<any[]>('/api/courses/catalog'),
    get: (id: string) => fetchApi<any>(`/api/courses/${id}`),
    myCourses: () => fetchApi<any[]>('/api/courses/my-courses'),
    myEnrollments: () => fetchApi<any[]>('/api/courses/my-enrollments'),
    all: () => fetchApi<any[]>('/api/courses/all'),
    enroll: (id: string) =>
      fetchApi<any>(`/api/courses/${id}/enroll`, { method: 'POST' }),
    create: (title: string, description?: string) =>
      fetchApi<any>('/api/courses/create', { method: 'POST', body: JSON.stringify({ title, description }) }),
    update: (id: string, data: any) =>
      fetchApi<any>(`/api/courses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    checkAccess: (courseId: string, studentId: string) =>
      fetchApi<any>(`/api/courses/${courseId}/check-access/${studentId}`),
    publish: (id: string) =>
      fetchApi<any>(`/api/courses/${id}/publish`, { method: 'PUT', body: JSON.stringify({}) }),
    getEnrollments: (courseId: string) =>
      fetchApi<any[]>(`/api/courses/${courseId}/enrollments`),
    approveEnrollment: (courseId: string, studentId: string) =>
      fetchApi<any>(`/api/courses/${courseId}/enrollments/${studentId}/approve`, { method: 'PUT', body: JSON.stringify({}) }),
    rejectEnrollment: (courseId: string, studentId: string) =>
      fetchApi<any>(`/api/courses/${courseId}/enrollments/${studentId}/reject`, { method: 'PUT', body: JSON.stringify({}) }),
    getMessages: (courseId: string) =>
      fetchApi<any[]>(`/api/courses/${courseId}/messages`),
    createMessage: (courseId: string, content: string) =>
      fetchApi<any>(`/api/courses/${courseId}/messages`, { method: 'POST', body: JSON.stringify({ content }) }),
    deleteMessage: (courseId: string, messageId: string) =>
      fetchApi<any>(`/api/courses/${courseId}/messages/${messageId}`, { method: 'DELETE' }),
  },
  users: {
    profile: () => fetchApi<any>('/api/users/profile'),
    update: (data: any) => fetchApi<any>('/api/users/update', { method: 'PUT', body: JSON.stringify(data) }),
  },
  content: {
    list: (courseId: string) => fetchApi<{ contents: any[]; hasFullAccess: boolean }>(`/api/content/course/${courseId}`),
    get: (id: string) => fetchApi<any>(`/api/content/${id}`),
    upload: async (courseId: string, file: File) => {
      const formData = new FormData();
      formData.append('file', file);

      const csrfToken = getCsrfToken();
      const headers: Record<string, string> = {};
      if (csrfToken) {
        headers[CSRF_HEADER_NAME] = csrfToken;
      }

      const response = await fetch(`${API_URL}/api/content/${courseId}/materials`, {
        method: 'POST',
        credentials: 'include',
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Errore di rete' }));
        throw new ApiError(response.status, error.error || 'Errore sconosciuto');
      }

      return response.json();
    },
    delete: (courseId: string, contentId: string) =>
      fetchApi<any>(`/api/content/${courseId}/materials/${contentId}`, { method: 'DELETE' }),
    updateVisibility: (courseId: string, contentId: string, isPublic: boolean) =>
      fetchApi<any>(`/api/content/${courseId}/materials/${contentId}`, { method: 'PUT', body: JSON.stringify({ isPublic }) }),
    batchUpdateVisibility: (courseId: string, contentIds: string[], isPublic: boolean) =>
      fetchApi<any>(`/api/content/${courseId}/materials/batch`, { method: 'PUT', body: JSON.stringify({ contentIds, isPublic }) }),
  },
  quiz: {
    catalog: () => fetchApi<any[]>('/api/quiz/quiz/catalog'),
    get: (id: string) => fetchApi<any>(`/api/quiz/quiz/${id}`),
    start: (id: string) =>
      fetchApi<any>(`/api/quiz/quiz/${id}/start`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    submit: (id: string, attemptId: string, questionSubmissions: any[]) =>
      fetchApi<any>(`/api/quiz/quiz/${id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ attemptId, questionSubmissions }),
      }),
    results: (id: string) => fetchApi<any>(`/api/quiz/quiz/${id}/results`),
    myCoursesQuizzes: () => fetchApi<any>(`/api/quiz/quiz/my-courses-quizzes`),
    create: (courseId: string, title: string, description: string, quizType?: string, maxAttempts?: number, shuffleQuestions?: boolean, shuffleAnswers?: boolean, showResultsImmediately?: boolean, passingScore?: number, timeLimit?: number) =>
      fetchApi<any>('/api/quiz/quiz', {
        method: 'POST',
        body: JSON.stringify({ courseId, title, description, quizType, maxAttempts, shuffleQuestions, shuffleAnswers, showResultsImmediately, passingScore, timeLimit }),
      }),
    update: (id: string, data: any) =>
      fetchApi<any>(`/api/quiz/quiz/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    getSettings: (id: string) =>
      fetchApi<any>(`/api/quiz/quiz/${id}/settings`),
    publish: (id: string) =>
      fetchApi<any>(`/api/quiz/quiz/${id}/publish`, { method: 'PUT', body: JSON.stringify({}) }),
    addQuestion: (quizId: string, text: string, questionType?: string, points?: number, answers?: any[]) =>
      fetchApi<any>(`/api/quiz/quiz/${quizId}/questions`, {
        method: 'POST',
        body: JSON.stringify({ text, questionType, points, answers }),
      }),
    updateQuestion: (quizId: string, questionId: string, data: any) =>
      fetchApi<any>(`/api/quiz/quiz/${quizId}/questions/${questionId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    deleteQuestion: (quizId: string, questionId: string) =>
      fetchApi<any>(`/api/quiz/quiz/${quizId}/questions/${questionId}`, { method: 'DELETE' }),
    addAnswer: (quizId: string, questionId: string, text: string, isCorrect?: boolean, points?: number) =>
      fetchApi<any>(`/api/quiz/quiz/${quizId}/questions/${questionId}/answers`, {
        method: 'POST',
        body: JSON.stringify({ text, isCorrect, points }),
      }),
    updateAnswer: (quizId: string, questionId: string, answerId: string, data: any) =>
      fetchApi<any>(`/api/quiz/quiz/${quizId}/questions/${questionId}/answers/${answerId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    deleteAnswer: (quizId: string, questionId: string, answerId: string) =>
      fetchApi<any>(`/api/quiz/quiz/${quizId}/questions/${questionId}/answers/${answerId}`, { method: 'DELETE' }),
    getAttempts: (id: string, page = 1, limit = 10) => 
      fetchApi<any>(`/api/quiz/quiz/${id}/attempts?page=${page}&limit=${limit}`),
    getPendingGrading: (id: string) => fetchApi<any>(`/api/quiz/quiz/${id}/attempts/pending-grading`),
    getAllAttempts: (id: string, includeGraded?: boolean) => 
      fetchApi<any>(`/api/quiz/quiz/${id}/attempts/all?includeGraded=${includeGraded || false}`),
    gradeSubmission: (quizId: string, attemptId: string, submissionId: string, points: number, feedback?: string, status?: string) =>
      fetchApi<any>(`/api/quiz/quiz/${quizId}/attempts/${attemptId}/grade/${submissionId}`, {
        method: 'PUT',
        body: JSON.stringify({ points, feedback, status }),
      }),
    updateFeedback: (quizId: string, attemptId: string, submissionId: string, points?: number, feedback?: string) =>
      fetchApi<any>(`/api/quiz/quiz/${quizId}/attempts/${attemptId}/submissions/${submissionId}/feedback`, {
        method: 'PUT',
        body: JSON.stringify({ points, feedback }),
      }),
    getStats: (id: string) => fetchApi<any>(`/api/quiz/quiz/${id}/stats`),
    getStudentHistory: () => fetchApi<any>('/api/quiz/quiz/student/history'),
    getByCourse: (courseId: string) => fetchApi<any[]>(`/api/quiz/quiz/by-course/${courseId}`),
    duplicate: (quizId: string, newTitle?: string, newCourseId?: string) =>
      fetchApi<any>(`/api/quiz/quiz/${quizId}/duplicate`, {
        method: 'POST',
        body: JSON.stringify({ newTitle, newCourseId }),
      }),
    preview: (quizId: string) => fetchApi<any>(`/api/quiz/quiz/${quizId}/preview`),
  },
  notifications: {
    list: () => fetchApi<{ notifications: any[]; unreadCount: number }>('/api/notifications'),
    getUnreadCount: () =>
      fetchApi<{ unreadCount: number }>('/api/notifications/count'),
    markAsRead: (id: string) =>
      fetchApi<any>('/api/notifications/read', { method: 'PUT', body: JSON.stringify({ notificationId: id }) }),
    markAllAsRead: () =>
      fetchApi<any>('/api/notifications/read-all', { method: 'PUT', body: '{}' }),
    delete: (id: string) =>
      fetchApi<any>(`/api/notifications/${id}`, { method: 'DELETE' }),
    stream: async (lastCheck: string): Promise<{ notifications: any[]; unreadCount: number; hasMore?: boolean; heartbeat?: boolean; timestamp: string }> => {
      const response = await fetch(`${API_URL}/api/notifications/stream?lastCheck=${encodeURIComponent(lastCheck)}`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new ApiError(response.status, 'Errore streaming notifiche');
      }
      
      return response.json();
    },
  },
};

export { ApiError };
