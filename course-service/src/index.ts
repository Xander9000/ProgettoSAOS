import crypto from 'crypto';
import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import jwt, { FastifyJWT } from '@fastify/jwt';
import cookie from '@fastify/cookie';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();
const fastify = Fastify({ logger: true });

if (!process.env.JWT_PUBLIC_KEY_B64) {
  throw new Error('JWT_PUBLIC_KEY_B64 environment variable is required');
}
const JWT_PUBLIC_KEY = Buffer.from(process.env.JWT_PUBLIC_KEY_B64, 'base64').toString('utf-8');
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY as string;
if (!INTERNAL_API_KEY) {
  throw new Error('INTERNAL_API_KEY environment variable is required');
}

function hashEnrollmentKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

const isInternalRequest = (request: FastifyRequest): boolean => {
  const apiKey = request.headers['x-internal-api-key'];
  if (!apiKey || typeof apiKey !== 'string') return false;
  try {
    const keyBuffer = Buffer.from(apiKey);
    const internalBuffer = Buffer.from(INTERNAL_API_KEY);
    if (keyBuffer.length !== internalBuffer.length) return false;
    return crypto.timingSafeEqual(keyBuffer, internalBuffer);
  } catch {
    return false;
  }
};
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3007';

fastify.register(cookie);
fastify.register(jwt, { 
  secret: { public: JWT_PUBLIC_KEY },
  verify: {
    algorithms: ['RS256']
  },
  cookie: {
    cookieName: 'accessToken',
    signed: false
  }
});

async function verifySessionWithTokenVersion(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  try {
    await request.jwtVerify();
    const userPayload = request.user as AuthUser & { tokenVersion?: number };
    
    const cookieHeader = request.headers.cookie;
    
    const response = await fetch(`${AUTH_SERVICE_URL}/verify-session`, {
      headers: cookieHeader ? { 'Cookie': cookieHeader } : {}
    });
    
    if (!response.ok) {
      reply.status(401).send({ error: 'Token non valido o sessione scaduta.', invalidated: true });
      return false;
    }
    
    const data = await response.json() as { valid: boolean; role?: string; userId?: string; tokenVersion?: number; updated?: boolean };
    
    if (!data.valid) {
      reply.status(401).send({ error: 'Token non valido o sessione scaduta.', invalidated: true });
      return false;
    }
    
    if (data.updated) {
      (request as any).user = { ...userPayload, role: data.role, tokenVersion: data.tokenVersion };
    } else {
      (request as any).user = { ...userPayload, role: data.role };
    }
    return true;
  } catch (err) {
    reply.status(401).send({ error: 'Token non valido o sessione scaduta.' });
    return false;
  }
}

async function createNotification(userId: string, type: string, title: string, message: string, courseId?: string, authToken?: string) {
  try {
    await fetch(`${NOTIFICATION_SERVICE_URL}/`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-internal-api-key': INTERNAL_API_KEY
      },
      body: JSON.stringify({ userId, type, title, message, courseId })
    });
  } catch (err) {
    fastify.log.error(`Failed to create notification: ${err}`);
  }
}

async function createBulkNotifications(userIds: string[], type: string, title: string, message: string, courseId?: string, authToken?: string) {
  if (userIds.length === 0) return;
  try {
    await fetch(`${NOTIFICATION_SERVICE_URL}/bulk`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-internal-api-key': INTERNAL_API_KEY
      },
      body: JSON.stringify({ userIds, type, title, message, courseId })
    });
  } catch (err) {
    fastify.log.error(`Failed to create bulk notifications: ${err}`);
  }
}

const enrollmentRateLimit = new Map<string, { count: number; resetAt: number }>();
const ENROLL_RATE_LIMIT = 10;
const ENROLL_RATE_WINDOW_MS = 60_000;

function checkEnrollmentRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = enrollmentRateLimit.get(key);
  if (!entry || now > entry.resetAt) {
    enrollmentRateLimit.set(key, { count: 1, resetAt: now + ENROLL_RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= ENROLL_RATE_LIMIT) return false;
  entry.count++;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of enrollmentRateLimit) {
    if (now > entry.resetAt) enrollmentRateLimit.delete(key);
  }
}, 5 * 60 * 1000);

interface AuthUser {
  userId: string;
  role: 'STUDENT' | 'TEACHER' | 'ADMIN';
}

interface CreateCourseBody {
  title: string;
  description?: string;
  teacherId?: string;
  isPublished?: boolean;
}

interface UpdateCourseBody {
  title?: string;
  description?: string;
  enrollmentType?: 'FREE' | 'KEY' | 'APPROVAL';
  enrollmentKey?: string;
  teacherId?: string;
  isPublished?: boolean;
}

interface EnrollBody {
  enrollmentKey?: string;
}

interface CreateMessageBody {
  content: string;
}

interface CourseParams {
  id: string;
}

interface CheckAccessParams {
  id: string;
  studentId: string;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
  const isValid = await verifySessionWithTokenVersion(request, reply);
  if (!isValid) {
    throw new Error('Unauthorized');
  }
});

// 1. Endpoint Aperto/Pubblico - Vetrina Corsi [READ-ONLY]
fastify.get('/catalog', async (request, reply) => {
  const courses = await prisma.course.findMany({
    where: { isPublished: true },
    select: {
      id: true,
      title: true,
      description: true,
      teacherId: true,
      isPublished: true,
      enrollmentType: true
    }
  });
  return courses;
});

// 2. Endpoint Riservato - Creazione di un Corso da parte del docente o admin (RBAC) [WRITE]
fastify.post<{ Body: CreateCourseBody }>('/create', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Body: CreateCourseBody }>, reply: FastifyReply) => {
  try {
    const user = request.user as AuthUser;
    
    if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
      return reply.status(403).send({ error: 'Violazione Permessi: solo docenti o admin possono creare corsi.' });
    }

    const { title, description, teacherId, isPublished } = request.body;
    
    if (!title || title.trim() === '') {
      return reply.status(400).send({ error: 'Il titolo del corso è obbligatorio.' });
    }
    if (title.trim().length > 200) {
      return reply.status(400).send({ error: 'Il titolo del corso non può superare 200 caratteri.' });
    }
    if (description && description.length > 2000) {
      return reply.status(400).send({ error: 'La descrizione non può superare 2000 caratteri.' });
    }

    let assignedTeacherId = user.userId;
    let publishStatus = false;

    if (user.role === 'ADMIN' && teacherId) {
      assignedTeacherId = teacherId;
      publishStatus = isPublished ?? false;
    }

    const cookieHeader = request.headers.cookie;
    const authHeader = request.headers.authorization;
    const teacherCheck = await fetch(`${AUTH_SERVICE_URL}/check-teacher/${assignedTeacherId}`, {
      headers: authHeader
        ? { 'Authorization': authHeader as string }
        : (cookieHeader ? { 'Cookie': cookieHeader } : {})
    });

    if (!teacherCheck.ok) {
      return reply.status(400).send({ error: 'Il docente specificato non esiste.' });
    }

    const teacherData = await teacherCheck.json() as { isTeacher: boolean };
    if (!teacherData.isTeacher) {
      return reply.status(400).send({ error: 'L\'utente specificato non è un docente.' });
    }

    const newCourse = await prisma.course.create({
      data: {
        id: crypto.randomUUID(),
        title: escapeHtml(title.trim()),
        description: description ? escapeHtml(description.trim()) : null,
        teacherId: assignedTeacherId,
        isPublished: publishStatus
      }
    });

    fastify.log.info(`Nuovo corso (ID ${newCourse.id}) creato con successo da User ${user.userId}`);

    return { success: true, course: newCourse };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: 'Errore nella creazione del corso. Riprova più tardi.' });
  }
});

// 2b. Endpoint Riservato - I Miei Corsi (teacher) o Tutti (admin) [READ]
fastify.get('/my-courses', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  
  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Accesso negato.' });
  }

  const whereClause = user.role === 'ADMIN' ? {} : { teacherId: user.userId };

  const courses = await prisma.course.findMany({
    where: whereClause,
    select: {
      id: true,
      title: true,
      teacherId: true,
      isPublished: true,
      createdAt: true
    },
    orderBy: { createdAt: 'desc' }
  });

  return courses;
});

// 2c. Endpoint Riservato - I Miei Corsi Iscritti (student) [READ]
fastify.get('/my-enrollments', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const user = request.user as AuthUser;
    
    if (user.role !== 'STUDENT') {
      return reply.status(403).send({ error: 'Accesso riservato agli studenti.' });
    }

    const enrollments = await prisma.enrollment.findMany({
      where: { studentId: user.userId },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            teacherId: true,
            isPublished: true,
            createdAt: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return enrollments.map(e => ({
      courseId: e.course.id,
      title: e.course.title,
      teacherId: e.course.teacherId,
      isPublished: e.course.isPublished,
      status: e.status,
      enrolledAt: e.createdAt
    }));
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: 'Errore nel caricamento dei corsi iscritti.' });
  }
});

// 2d. Endpoint Riservato - Tutti i Corsi (admin) [READ]
fastify.get('/all', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  
  if (user.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Accesso riservato agli admin.' });
  }

  const courses = await prisma.course.findMany({
    select: {
      id: true,
      title: true,
      teacherId: true,
      isPublished: true,
      createdAt: true
    },
    orderBy: { createdAt: 'desc' }
  });

  return courses;
});

// 1b. Endpoint - Dettagli Corso [READ]
fastify.get<{ Params: CourseParams }>('/:id', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: CourseParams }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { id: courseId } = request.params;

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      title: true,
      description: true,
      teacherId: true,
      isPublished: true,
      enrollmentType: true,
      createdAt: true,
      updatedAt: true
    }
  });

  if (!course) {
    return reply.status(404).send({ error: 'Corso non trovato.' });
  }

  const isTeacher = user.role === 'TEACHER' && course.teacherId === user.userId;
  const isAdmin = user.role === 'ADMIN';

  if (!course.isPublished && !isTeacher && !isAdmin) {
    return reply.status(404).send({ error: 'Corso non trovato.' });
  }

  let teacherMessages: any[] = [];
  
  if (isTeacher || isAdmin) {
    const messages = await prisma.teacherMessage.findMany({
      where: { courseId },
      select: { id: true, content: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    });
    teacherMessages = messages;
  } else if (user.role === 'STUDENT') {
    const enrollment = await prisma.enrollment.findFirst({
      where: { courseId, studentId: user.userId, status: 'ACTIVE' }
    });
    if (enrollment) {
      const messages = await prisma.teacherMessage.findMany({
        where: { courseId },
        select: { id: true, content: true, createdAt: true },
        orderBy: { createdAt: 'desc' }
      });
      teacherMessages = messages;
    }
  }

  return { ...course, teacherMessages };
});

// 2e. Endpoint Riservato - Aggiorna un Corso [WRITE]
fastify.put<{ Params: CourseParams; Body: UpdateCourseBody }>('/:id', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: CourseParams; Body: UpdateCourseBody }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { id: courseId } = request.params;
  const { title, description, enrollmentType, enrollmentKey, teacherId, isPublished } = request.body || {};

  const course = await prisma.course.findUnique({ where: { id: courseId } });

  if (!course) {
    return reply.status(404).send({ error: 'Corso non trovato.' });
  }

  const isTeacher = user.role === 'TEACHER' && course.teacherId === user.userId;
  const isAdmin = user.role === 'ADMIN';

  if (!isTeacher && !isAdmin) {
    return reply.status(403).send({ error: 'Non autorizzato a modificare questo corso.' });
  }

  if (enrollmentType !== undefined && !['FREE', 'KEY', 'APPROVAL'].includes(enrollmentType)) {
    return reply.status(400).send({ error: 'Tipo iscrizione non valido.' });
  }

  const updateData: Record<string, unknown> = {};
  if (title) updateData.title = escapeHtml(title);
  if (description !== undefined) updateData.description = description ? escapeHtml(description) : null;

  if (enrollmentType !== undefined) {
    updateData.enrollmentType = enrollmentType;

    if (enrollmentType === 'KEY') {
      if (enrollmentKey) {
        updateData.enrollmentKey = hashEnrollmentKey(enrollmentKey);
      } else if (course.enrollmentType === 'KEY' && course.enrollmentKey) {
        updateData.enrollmentKey = course.enrollmentKey;
      } else {
        updateData.enrollmentKey = hashEnrollmentKey(crypto.randomBytes(16).toString('hex'));
      }
    } else {
      updateData.enrollmentKey = null;
    }
  } else if (enrollmentKey !== undefined) {
    if (course.enrollmentType === 'KEY') {
      updateData.enrollmentKey = hashEnrollmentKey(enrollmentKey);
    } else {
      return reply.status(400).send({ error: 'Per aggiornare la chiave di iscrizione il corso deve essere di tipo KEY.' });
    }
  }

  if (isAdmin) {
    if (teacherId !== undefined) {
      const cookieHeader = request.headers.cookie;
      const authHeader = request.headers.authorization;
      const teacherCheck = await fetch(`${AUTH_SERVICE_URL}/check-teacher/${teacherId}`, {
        headers: authHeader
          ? { 'Authorization': authHeader as string }
          : (cookieHeader ? { 'Cookie': cookieHeader } : {})
      });

      if (!teacherCheck.ok) {
        return reply.status(400).send({ error: 'Il docente specificato non esiste.' });
      }

      const teacherData = await teacherCheck.json() as { isTeacher: boolean };
      if (!teacherData.isTeacher) {
        return reply.status(400).send({ error: 'L\'utente specificato non è un docente.' });
      }

      updateData.teacherId = teacherId;
    }
    if (isPublished !== undefined) updateData.isPublished = isPublished;
  }

  const updatedCourse = await prisma.course.update({
    where: { id: courseId },
    data: updateData
  });

  fastify.log.info(`Corso (ID ${courseId}) aggiornato da User ${user.userId}`);

  return { success: true, course: updatedCourse };
});

// 2e. Endpoint Riservato - Pubblica un Corso [WRITE]
fastify.put<{ Params: CourseParams }>('/:id/publish', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: CourseParams }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { id: courseId } = request.params;
  
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  
  if (!course) {
    return reply.status(404).send({ error: 'Corso non trovato.' });
  }

  const isTeacher = user.role === 'TEACHER' && course.teacherId === user.userId;
  const isAdmin = user.role === 'ADMIN';

  if (!isTeacher && !isAdmin) {
    return reply.status(403).send({ error: 'Non autorizzato a modificare questo corso.' });
  }

  const updatedCourse = await prisma.course.update({
    where: { id: courseId },
    data: { isPublished: true }
  });

  fastify.log.info(`Corso ${courseId} pubblicato da User ${user.userId}`);

  return { success: true, course: updatedCourse };
});

// 2f. Endpoint Riservato - Annulla Pubblicazione Corso [WRITE]
fastify.put<{ Params: CourseParams }>('/:id/unpublish', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: CourseParams }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { id: courseId } = request.params;
  
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  
  if (!course) {
    return reply.status(404).send({ error: 'Corso non trovato.' });
  }

  const isAdmin = user.role === 'ADMIN';

  if (!isAdmin) {
    return reply.status(403).send({ error: 'Solo admin può annullare la pubblicazione.' });
  }

  const updatedCourse = await prisma.course.update({
    where: { id: courseId },
    data: { isPublished: false }
  });

  fastify.log.info(`Corso ${courseId} non pubblicato da User ${user.userId}`);

  return { success: true, course: updatedCourse };
});

// 2g. Endpoint Riservato - Elimina un Corso [DELETE]
fastify.delete<{ Params: CourseParams }>('/:id', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: CourseParams }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { id: courseId } = request.params;
  
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  
  if (!course) {
    return reply.status(404).send({ error: 'Corso non trovato.' });
  }

  const isAdmin = user.role === 'ADMIN';

  if (!isAdmin) {
    return reply.status(403).send({ error: 'Solo admin può eliminare corsi.' });
  }

  await prisma.enrollment.deleteMany({ where: { courseId } });
  await prisma.course.delete({ where: { id: courseId } });

  fastify.log.info(`Corso ${courseId} eliminato da User ${user.userId}`);

  return { success: true, message: 'Corso eliminato con successo.' };
});

// 3. Endpoint Riservato - Iscrizione Studente (RBAC) [WRITE]
fastify.post<{ Params: CourseParams; Body: EnrollBody }>('/:id/enroll', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: CourseParams; Body: EnrollBody }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { id: courseId } = request.params;
  const { enrollmentKey } = request.body || {};

  if (user.role !== 'STUDENT') {
    return reply.status(403).send({ error: 'Solo account Studente possono iscriversi ai corsi.' });
  }

  const rateLimitKey = `${request.ip}:${courseId}`;
  if (!checkEnrollmentRateLimit(rateLimitKey)) {
    return reply.status(429).send({ error: 'Troppi tentativi di iscrizione. Riprova tra un minuto.' });
  }

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) {
    return reply.status(404).send({ error: 'Il corso richiesto non esiste o è stato rimosso.' });
  }

  if (!course.isPublished) {
    return reply.status(404).send({ error: 'Il corso richiesto non esiste o è stato rimosso.' });
  }

  if (course.enrollmentType === 'KEY') {
    if (!enrollmentKey) {
      return reply.status(400).send({ error: 'È richiesta la chiave di iscrizione.' });
    }
    if (!course.enrollmentKey) {
      return reply.status(409).send({ error: 'Corso in configurazione errata: contattare il docente.' });
    }
    if (!crypto.timingSafeEqual(Buffer.from(hashEnrollmentKey(enrollmentKey)), Buffer.from(course.enrollmentKey))) {
      return reply.status(403).send({ error: 'Chave di iscrizione non valida.' });
    }
  }

  // Prevenzione Duplicate Enrollment
  const enrollmentStatus = course.enrollmentType === 'APPROVAL' ? 'PENDING' : 'ACTIVE';

  const existingEnrollment = await prisma.enrollment.findUnique({
    where: {
      courseId_studentId: { courseId, studentId: user.userId }
    }
  });

  if (existingEnrollment) {
    if (existingEnrollment.status === 'ACTIVE') {
      return reply.status(400).send({ error: 'Il tuo profilo è già attivamente iscritto al corso.' });
    }
    if (existingEnrollment.status === 'PENDING') {
      return reply.status(400).send({ error: 'La tua richiesta di iscrizione è in attesa di approvazione.' });
    }
  }

  const enrollment = await prisma.enrollment.create({
    data: {
      courseId,
      studentId: user.userId,
      status: enrollmentStatus
    }
  });

  if (course.enrollmentType === 'APPROVAL') {
    fastify.log.info(`Enrollment richiesto: L'utente ${user.userId} ha richiesto l'iscrizione al corso ${courseId} - in attesa di approvazione`);
    return { success: true, message: 'Richiesta di iscrizione inviata. In attesa di approvazione del docente.' };
  }

  const authHeader = request.headers.authorization as string;
  const authToken = authHeader?.replace('Bearer ', '');

  await createNotification(
    course.teacherId,
    'ENROLLMENT',
    'Nuovo studente iscritto',
    `Uno studente si è iscritto al tuo corso "${course.title}"`,
    courseId,
    authToken
  );

  fastify.log.info(`Enrollment avvenuto: L'utente ${user.userId} è entrato nel corso ${courseId}`);
  
  return { success: true, message: 'Iscrizione validata ed approvata.' };
});

// 4. API di Zero-Trust interno - Consente agli altri microservizi di verificare le concessioni
fastify.get<{ Params: CheckAccessParams }>('/:id/check-access/:studentId', async (request: FastifyRequest<{ Params: CheckAccessParams }>, reply: FastifyReply) => {
  const { id: courseId, studentId } = request.params;

  if (!isInternalRequest(request)) {
    const isAuthenticated = await verifySessionWithTokenVersion(request, reply);
    if (!isAuthenticated) {
      return;
    }

    const user = request.user as AuthUser;

    if (user.role === 'STUDENT' && user.userId !== studentId) {
      return reply.status(403).send({ error: 'Non puoi verificare l\'accesso di altri studenti.' });
    }

    if (user.role === 'TEACHER') {
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course || course.teacherId !== user.userId) {
        return reply.status(403).send({ error: 'Non sei il docente di questo corso.' });
      }
    }
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: {
      courseId,
      studentId,
      status: 'ACTIVE'
    }
  });
  
  return { hasAccess: !!enrollment };
});

// 5. Endpoint Riservato - Lista richieste iscrizione per un corso (con dati studente)
fastify.get<{ Params: CourseParams }>('/:id/enrollments', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: CourseParams }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { id: courseId } = request.params;

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) {
    return reply.status(404).send({ error: 'Corso non trovato.' });
  }

  const isTeacher = user.role === 'TEACHER' && course.teacherId === user.userId;
  const isAdmin = user.role === 'ADMIN';

  if (!isTeacher && !isAdmin) {
    return reply.status(403).send({ error: 'Non autorizzato a visualizzare le richieste di iscrizione.' });
  }

  const enrollments = await prisma.enrollment.findMany({
    where: { courseId },
    orderBy: { createdAt: 'desc' }
  });

  const studentIds = enrollments.map(e => e.studentId);
  const studentsResponse = await fetch(`${AUTH_SERVICE_URL}/users/batch`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'x-internal-api-key': INTERNAL_API_KEY
    },
    body: JSON.stringify({ ids: studentIds })
  });

  const studentsData = studentsResponse.ok ? await studentsResponse.json() as { users: any[] } : { users: [] };
  const studentsMap = new Map(studentsData.users.map(u => [u.id, u]));

  const enrichedEnrollments = enrollments.map(e => ({
    ...e,
    student: studentsMap.get(e.studentId) || null
  }));

  return enrichedEnrollments;
});

// 6. Endpoint Riservato - Approva richiesta iscrizione
fastify.put<{ Params: { id: string; studentId: string } }>('/:id/enrollments/:studentId/approve', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: { id: string; studentId: string } }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { id: courseId, studentId } = request.params;

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) {
    return reply.status(404).send({ error: 'Corso non trovato.' });
  }

  const isTeacher = user.role === 'TEACHER' && course.teacherId === user.userId;
  const isAdmin = user.role === 'ADMIN';

  if (!isTeacher && !isAdmin) {
    return reply.status(403).send({ error: 'Non autorizzato ad approvare le richieste di iscrizione.' });
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: { courseId_studentId: { courseId, studentId } }
  });

  if (!enrollment) {
    return reply.status(404).send({ error: 'Richiesta di iscrizione non trovata.' });
  }

  if (enrollment.status !== 'PENDING') {
    return reply.status(400).send({ error: 'La richiesta non è in attesa di approvazione.' });
  }

  const updated = await prisma.enrollment.update({
    where: { courseId_studentId: { courseId, studentId } },
    data: { status: 'ACTIVE' }
  });

  await createNotification(
    studentId,
    'ENROLLMENT',
    'Iscrizione approvata',
    `La tua richiesta di iscrizione al corso "${course.title}" è stata approvata!`,
    courseId,
    request.headers.authorization?.replace('Bearer ', '')
  );

  fastify.log.info(`Enrollment approvato: Studente ${studentId} iscritto al corso ${courseId} da User ${user.userId}`);

  return { success: true, message: 'Iscrizione approvata.', enrollment: updated };
});

// 7. Endpoint Riservato - Rifiuta/Rimuovi richiesta iscrizione
fastify.put<{ Params: { id: string; studentId: string } }>('/:id/enrollments/:studentId/reject', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: { id: string; studentId: string } }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { id: courseId, studentId } = request.params;

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) {
    return reply.status(404).send({ error: 'Corso non trovato.' });
  }

  const isTeacher = user.role === 'TEACHER' && course.teacherId === user.userId;
  const isAdmin = user.role === 'ADMIN';

  if (!isTeacher && !isAdmin) {
    return reply.status(403).send({ error: 'Non autorizzato a rifiutare le richieste di iscrizione.' });
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: { courseId_studentId: { courseId, studentId } }
  });

  if (!enrollment) {
    return reply.status(404).send({ error: 'Richiesta di iscrizione non trovata.' });
  }

  await prisma.enrollment.delete({
    where: { courseId_studentId: { courseId, studentId } }
  });

  fastify.log.info(`Enrollment rifiutato: Richiesta di ${studentId} per corso ${courseId} rimossa da User ${user.userId}`);

  return { success: true, message: 'Richiesta di iscrizione rifiutata e rimossa.' };
});

// 7b. Endpoint Riservato - Rimuovi studente iscritto dal corso
fastify.delete<{ Params: { id: string; studentId: string } }>('/:id/enrollments/:studentId', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: { id: string; studentId: string } }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { id: courseId, studentId } = request.params;

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) {
    return reply.status(404).send({ error: 'Corso non trovato.' });
  }

  const isTeacher = user.role === 'TEACHER' && course.teacherId === user.userId;
  const isAdmin = user.role === 'ADMIN';

  if (!isTeacher && !isAdmin) {
    return reply.status(403).send({ error: 'Non autorizzato a rimuovere studenti da questo corso.' });
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: { courseId_studentId: { courseId, studentId } }
  });

  if (!enrollment) {
    return reply.status(404).send({ error: 'Studente non iscritto a questo corso.' });
  }

  await prisma.enrollment.delete({
    where: { courseId_studentId: { courseId, studentId } }
  });

  const authToken = request.headers.authorization?.replace('Bearer ', '');
  await createNotification(
    studentId,
    'REMOVAL',
    'Rimosso dal corso',
    `Sei stato rimosso dal corso "${course.title}"`,
    courseId,
    authToken
  );

  fastify.log.info(`Studente ${studentId} rimosso dal corso ${courseId} da User ${user.userId}`);

  return { success: true, message: 'Studente rimosso dal corso.' };
});

// 8. Endpoint Riservato - Crea un messaggio del docente
fastify.post<{ Params: CourseParams; Body: CreateMessageBody }>('/:id/messages', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: CourseParams; Body: CreateMessageBody }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { id: courseId } = request.params;
  const { content } = request.body;

  if (!content || content.trim() === '') {
    return reply.status(400).send({ error: 'Il messaggio non può essere vuoto.' });
  }

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) {
    return reply.status(404).send({ error: 'Corso non trovato.' });
  }

  const isTeacher = user.role === 'TEACHER' && course.teacherId === user.userId;
  const isAdmin = user.role === 'ADMIN';

  if (!isTeacher && !isAdmin) {
    return reply.status(403).send({ error: 'Non autorizzato a pubblicare messaggi in questo corso.' });
  }

  const sanitizedContent = escapeHtml(content.trim());

  const message = await prisma.teacherMessage.create({
    data: {
      courseId,
      content: sanitizedContent
    }
  });

  const enrollments = await prisma.enrollment.findMany({
    where: { courseId, status: 'ACTIVE' },
    select: { studentId: true }
  });

  const studentIds = enrollments.map(e => e.studentId);
  const authToken = request.headers.authorization?.replace('Bearer ', '');
  await createBulkNotifications(
    studentIds,
    'MESSAGE',
    'Nuovo messaggio dal docente',
    `Il docente ha pubblicato un nuovo messaggio nel corso "${course.title}"`,
    courseId,
    authToken
  );

  fastify.log.info(`Messaggio creato nel corso ${courseId} da User ${user.userId}, ${studentIds.length} notifiche inviate`);

  return { success: true, message };
});

// 9. Endpoint Riservato - Lista messaggi del corso (solo iscritti)
fastify.get<{ Params: CourseParams }>('/:id/messages', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: CourseParams }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { id: courseId } = request.params;

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) {
    return reply.status(404).send({ error: 'Corso non trovato.' });
  }

  const isEnrolled = await prisma.enrollment.findFirst({
    where: {
      courseId,
      studentId: user.userId,
      status: 'ACTIVE'
    }
  });

  const isTeacher = user.role === 'TEACHER' && course.teacherId === user.userId;
  const isAdmin = user.role === 'ADMIN';

  if (!isEnrolled && !isTeacher && !isAdmin) {
    return reply.status(403).send({ error: 'Devi essere iscritto al corso per vedere i messaggi.' });
  }

  const messages = await prisma.teacherMessage.findMany({
    where: { courseId },
    orderBy: { createdAt: 'desc' }
  });

  return messages;
});

// 10. Endpoint Riservato - Elimina un messaggio del docente
fastify.delete<{ Params: { id: string; messageId: string } }>('/:id/messages/:messageId', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: { id: string; messageId: string } }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { id: courseId, messageId } = request.params;

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) {
    return reply.status(404).send({ error: 'Corso non trovato.' });
  }

  const isTeacher = user.role === 'TEACHER' && course.teacherId === user.userId;
  const isAdmin = user.role === 'ADMIN';

  if (!isTeacher && !isAdmin) {
    return reply.status(403).send({ error: 'Non autorizzato a eliminare messaggi in questo corso.' });
  }

  const message = await prisma.teacherMessage.findUnique({ where: { id: messageId } });
  if (!message || message.courseId !== courseId) {
    return reply.status(404).send({ error: 'Messaggio non trovato.' });
  }

  await prisma.teacherMessage.delete({
    where: { id: messageId }
  });

  fastify.log.info(`Messaggio ${messageId} eliminato dal corso ${courseId} da User ${user.userId}`);

  return { success: true, message: 'Messaggio eliminato.' };
});

// 11. Endpoint per ottenere la lista degli studenti iscritti (usato dai servizi interni)
fastify.get<{ Params: { id: string } }>('/courses/enrolled/:id', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { id: courseId } = request.params;

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) {
    return reply.status(404).send({ error: 'Corso non trovato.' });
  }

  const isTeacher = user.role === 'TEACHER' && course.teacherId === user.userId;
  const isAdmin = user.role === 'ADMIN';

  if (!isTeacher && !isAdmin) {
    return reply.status(403).send({ error: 'Non autorizzato a visualizzare gli iscritti di questo corso.' });
  }

  const enrollments = await prisma.enrollment.findMany({
    where: { courseId, status: 'ACTIVE' },
    select: { studentId: true }
  });

  return { students: enrollments.map(e => ({ userId: e.studentId })) };
});

fastify.addHook('onClose', async () => {
  await prisma.$disconnect();
});

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3003;
    await fastify.listen({ port, host: '0.0.0.0' });
    fastify.log.info(`Course Service Core logica di business in run su http://0.0.0.0:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

if (require.main === module) {
  start();
}

export { fastify, prisma };
