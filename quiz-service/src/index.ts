import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import jwt, { FastifyJWT } from '@fastify/jwt';
import cookie from '@fastify/cookie';
import { PrismaClient, QuizType, QuestionType, GradingStatus } from '@prisma/client';

const prisma = new PrismaClient();

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
const COURSE_SERVICE_URL = process.env.COURSE_SERVICE_URL || 'http://localhost:3003';
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3007';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
if (!INTERNAL_API_KEY) {
  throw new Error('INTERNAL_API_KEY environment variable is required');
}

if (!process.env.JWT_PUBLIC_KEY_B64) {
  throw new Error('JWT_PUBLIC_KEY_B64 environment variable is required');
}
const JWT_PUBLIC_KEY = Buffer.from(process.env.JWT_PUBLIC_KEY_B64, 'base64').toString('utf-8');

const fastify = Fastify({ logger: true });

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

interface AuthUser {
  userId: string;
  role: string;
  tokenVersion?: number;
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
    requireRole: (roles: string[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined>;
  }
}

interface QuizParams {
  id: string;
}

interface CourseParams {
  courseId: string;
}

interface QuestionParams {
  id: string;
  questionId: string;
}

interface AnswerParams {
  id: string;
  questionId: string;
  answerId: string;
}

interface AttemptParams {
  id: string;
  attemptId: string;
  submissionId: string;
}

interface AttemptsQuery {
  page?: string;
  limit?: string;
}

interface IncludeGradedQuery {
  includeGraded?: string;
}

interface CreateQuizBody {
  courseId: string;
  title: string;
  description?: string;
  quizType?: string;
  maxAttempts?: number;
  shuffleQuestions?: boolean;
  shuffleAnswers?: boolean;
  showResultsImmediately?: boolean;
  passingScore?: number;
  timeLimit?: number | null;
}

interface UpdateQuizBody {
  title?: string;
  description?: string;
  quizType?: string;
  maxAttempts?: number;
  shuffleQuestions?: boolean;
  shuffleAnswers?: boolean;
  showResultsImmediately?: boolean;
  passingScore?: number;
  timeLimit?: number | null;
  status?: string;
  enableNegativePoints?: boolean;
  negativePointsValue?: number;
}

interface AddQuestionBody {
  text: string;
  questionType?: string;
  points?: number;
  negativePoints?: number;
  answers?: { text: string; isCorrect: boolean; points?: number }[];
}

interface UpdateQuestionBody {
  text?: string;
  questionType?: string;
  points?: number;
  negativePoints?: number;
}

interface AddAnswerBody {
  text: string;
  isCorrect?: boolean;
  points?: number;
}

interface UpdateAnswerBody {
  text?: string;
  isCorrect?: boolean;
  points?: number;
}

interface DuplicateQuizBody {
  newTitle?: string;
  newCourseId?: string;
}

interface SubmitAnswerBody {
  questionId: string;
  answerId?: string;
  textAnswer?: string;
}

interface SubmitQuizBody {
  attemptId?: string;
  questionSubmissions: SubmitAnswerBody[];
}

interface GradeSubmissionBody {
  points: number;
  feedback?: string;
  status?: string;
}

interface FeedbackBody {
  points?: number;
  feedback?: string;
}

interface CourseSummary {
  id: string;
  title: string;
}

async function verifySessionWithTokenVersion(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  try {
    await request.jwtVerify();
    const userPayload = request.user as AuthUser;
    
    const cookieHeader = request.headers.cookie;
    
    const response = await fetch(`${AUTH_SERVICE_URL}/verify-session`, {
      headers: cookieHeader ? { 'Cookie': cookieHeader } : {}
    });
    
    if (!response.ok) {
      reply.status(401).send({ error: 'Sessione invalidata. Effettua il login.', invalidated: true });
      return false;
    }
    
    const data = await response.json() as { valid: boolean; role?: string };
    
    if (!data.valid) {
      reply.status(401).send({ error: 'Sessione invalidata. Effettua il login.', invalidated: true });
      return false;
    }
    
    request.user = { ...userPayload, role: data.role || userPayload.role };
    return true;
  } catch (err) {
    reply.status(401).send({ error: 'Token non valido o sessione scaduta.' });
    return false;
  }
}

fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
  const isValid = await verifySessionWithTokenVersion(request, reply);
  if (!isValid) {
    throw new Error('Unauthorized');
  }
});

fastify.decorate('requireRole', function (roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser;
    if (!roles.includes(user.role)) {
      return reply.status(403).send({ error: 'Non hai i permessi per questa operazione.' });
    }
  };
});

async function checkCourseEnrollment(studentId: string, courseId: string, cookieHeader?: string): Promise<boolean> {
  try {
    const response = await fetch(`${COURSE_SERVICE_URL}/${courseId}/check-access/${studentId}`, {
      headers: cookieHeader ? { 'Cookie': cookieHeader } : {}
    });
    const data = await response.json() as { hasAccess?: boolean };
    return data.hasAccess || false;
  } catch (error) {
    fastify.log.error({ err: error }, 'Error checking course enrollment');
    return false;
  }
}

async function checkCourseOwnership(teacherId: string, courseId: string, cookieHeader?: string): Promise<boolean> {
  try {
    const response = await fetch(`${COURSE_SERVICE_URL}/${courseId}`, {
      headers: cookieHeader ? { 'Cookie': cookieHeader } : {}
    });
    if (!response.ok) return false;
    const course = await response.json() as { teacherId?: string };
    return course.teacherId === teacherId;
  } catch (error) {
    fastify.log.error({ err: error }, 'Error checking course ownership');
    return false;
  }
}

async function verifyQuizOwnership(quizId: string, teacherId: string, cookieHeader?: string): Promise<boolean> {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: { courseId: true }
  });
  if (!quiz) return false;
  return checkCourseOwnership(teacherId, quiz.courseId, cookieHeader);
}

function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

function validateUUIDParam(value: string, paramName: string): void {
  if (!value || !isValidUUID(value)) {
    throw new Error(`Parametro ${paramName} non valido`);
  }
}

function validateQuizType(type: string): boolean {
  return ['ESAME', 'PREPARAZIONE', 'CUSTOM'].includes(type);
}

function validateQuizStatus(status: string): boolean {
  return ['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(status);
}

function validateQuestionType(type: string): boolean {
  return ['MULTIPLE_CHOICE', 'OPEN_ANSWER'].includes(type);
}

function validateNumberInRange(value: number, min: number, max: number, fieldName: string): void {
  if (typeof value !== 'number' || isNaN(value) || value < min || value > max) {
    throw new Error(`${fieldName} deve essere compreso tra ${min} e ${max}`);
  }
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

fastify.get('/quiz/catalog', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const cookieHeader = request.headers.cookie as string;

  const allQuizzes = await prisma.quiz.findMany({
    where: { status: 'PUBLISHED' },
    select: {
      id: true,
      title: true,
      description: true,
      quizType: true,
      courseId: true,
      maxAttempts: true,
      shuffleQuestions: true,
      shuffleAnswers: true,
      showResultsImmediately: true,
      passingScore: true,
      timeLimit: true,
      _count: { select: { questions: true } }
    }
  });

  const filteredQuizzes = [];
  for (const quiz of allQuizzes) {
    if (user.role === 'ADMIN') {
      filteredQuizzes.push(quiz);
      continue;
    }
    
    if (user.role === 'TEACHER') {
      const isOwner = await checkCourseOwnership(user.userId, quiz.courseId, cookieHeader);
      if (isOwner) {
        filteredQuizzes.push(quiz);
      }
      continue;
    }

    const hasAccess = await checkCourseEnrollment(user.userId, quiz.courseId, cookieHeader);
    if (hasAccess) {
      filteredQuizzes.push(quiz);
    }
  }

  return filteredQuizzes;
});

fastify.get<{ Params: QuizParams }>('/quiz/:id/preview', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: QuizParams }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { id } = request.params;
  const cookieHeader = request.headers.cookie as string;

  if (!isValidUUID(id)) {
    return reply.status(400).send({ error: 'ID quiz non valido.' });
  }

  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Accesso negato.' });
  }

  if (user.role === 'TEACHER') {
    const isOwner = await verifyQuizOwnership(id, user.userId, cookieHeader);
    if (!isOwner) {
      return reply.status(403).send({ error: 'Accesso negato.' });
    }
  }

  const quiz = await prisma.quiz.findUnique({
    where: { id },
    include: {
      questions: {
        orderBy: { order: 'asc' },
        select: {
          id: true,
          text: true,
          order: true,
          questionType: true,
          points: true,
          answers: {
            orderBy: { order: 'asc' },
            select: {
              id: true,
              text: true,
              order: true,
              points: true
            }
          }
        }
      }
    }
  });

  if (!quiz) {
    return reply.status(404).send({ error: 'Quiz non trovato.' });
  }

  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    enableNegativePoints: quiz.enableNegativePoints,
    negativePointsValue: quiz.negativePointsValue,
    questions: quiz.questions
  };
});

fastify.get<{ Params: CourseParams }>('/quiz/by-course/:courseId', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: CourseParams }>, reply: FastifyReply) => {
  const { courseId } = request.params;
  const user = request.user as AuthUser;
  const cookieHeader = request.headers.cookie as string;

  if (!isValidUUID(courseId)) {
    return reply.status(400).send({ error: 'ID corso non valido.' });
  }

  let hasAccess = false;
  
  if (user.role === 'TEACHER' || user.role === 'ADMIN') {
    if (user.role === 'TEACHER') {
      const isOwner = await checkCourseOwnership(user.userId, courseId, cookieHeader);
      if (!isOwner) {
        return reply.status(403).send({ error: 'Accesso negato.' });
      }
    }
    hasAccess = true;
  } else if (user.role === 'STUDENT') {
    hasAccess = await checkCourseEnrollment(user.userId, courseId, cookieHeader);
    if (!hasAccess) {
      return reply.status(403).send({ error: 'Non sei iscritto a questo corso.' });
    }
  }

  const quizzes = await prisma.quiz.findMany({
    where: { courseId, status: 'PUBLISHED' },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      quizType: true,
      maxAttempts: true,
      shuffleQuestions: true,
      shuffleAnswers: true,
      showResultsImmediately: true,
      passingScore: true,
      timeLimit: true,
      _count: { select: { questions: true, attempts: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  return quizzes;
});

fastify.get<{ Params: QuizParams }>('/quiz/:id', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: QuizParams }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const cookieHeader = request.headers.cookie as string;
  const { id } = request.params;
  
  if (!isValidUUID(id)) {
    return reply.status(400).send({ error: 'ID quiz non valido.' });
  }

  const quiz = await prisma.quiz.findUnique({
    where: { id },
    include: {
      questions: {
        include: {
          answers: {
            select: { id: true, text: true, order: true }
          }
        }
      }
    }
  });

  if (!quiz) {
    return reply.status(404).send({ error: 'Quiz non trovato.' });
  }

  if (quiz.status !== 'PUBLISHED') {
    const isTeacherOfCourse = user.role === 'TEACHER' || user.role === 'ADMIN';
    if (!isTeacherOfCourse) {
      return reply.status(403).send({ error: 'Quiz non disponibile.' });
    }
  }

  const hasAccess = await checkCourseEnrollment(user.userId, quiz.courseId, cookieHeader);
  const isTeacherOfCourse = user.role === 'TEACHER' && await checkCourseOwnership(user.userId, quiz.courseId, cookieHeader);
  if (!hasAccess && !isTeacherOfCourse && user.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Non sei iscritto a questo corso.' });
  }

  let questions = quiz.questions.map((q: any) => ({
    id: q.id,
    text: q.text,
    order: q.order,
    questionType: q.questionType,
    points: q.points,
    answers: q.answers.map((a: any) => ({ id: a.id, text: a.text, order: a.order }))
  }));

  if (quiz.shuffleQuestions) {
    questions = shuffleArray(questions);
  }

  if (quiz.shuffleAnswers) {
    questions = questions.map((q: any) => ({
      ...q,
      answers: shuffleArray(q.answers)
    }));
  }

  return { 
    id: quiz.id, 
    title: quiz.title, 
    description: quiz.description,
    quizType: quiz.quizType,
    maxAttempts: quiz.maxAttempts,
    showResultsImmediately: quiz.showResultsImmediately,
    passingScore: quiz.passingScore,
    timeLimit: quiz.timeLimit,
    enableNegativePoints: quiz.enableNegativePoints,
    negativePointsValue: quiz.negativePointsValue,
    questions 
  };
});

fastify.post<{ Body: CreateQuizBody }>('/quiz', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Body: CreateQuizBody }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { courseId, title, description, quizType, maxAttempts, shuffleQuestions, shuffleAnswers, showResultsImmediately, passingScore, timeLimit } = request.body;
  const cookieHeader = request.headers.cookie as string;

  if (!courseId || !isValidUUID(courseId)) {
    return reply.status(400).send({ error: 'ID corso non valido.' });
  }

  if (!title || title.trim() === '') {
    return reply.status(400).send({ error: 'Il titolo è obbligatorio.' });
  }

  const effectiveQuizType = (quizType && validateQuizType(quizType)) ? quizType : 'CUSTOM';
  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Accesso negato.' });
  }

  if (user.role === 'TEACHER') {
    const isOwner = await checkCourseOwnership(user.userId, courseId, cookieHeader);
    if (!isOwner) {
      return reply.status(403).send({ error: 'Accesso negato.' });
    }
  }

  if (passingScore !== undefined) {
    try {
      validateNumberInRange(passingScore, 0, 100, 'Passing score');
    } catch {
      return reply.status(400).send({ error: 'Valore non valido per il punteggio minimo.' });
    }
  }

  if (timeLimit !== undefined && timeLimit !== null) {
    try {
      validateNumberInRange(timeLimit, 60, 7200, 'Time limit');
    } catch {
      return reply.status(400).send({ error: 'Valore non valido per il limite di tempo.' });
    }
  }

  if (maxAttempts !== undefined) {
    try {
      validateNumberInRange(maxAttempts, -1, 999, 'Max attempts');
    } catch {
      return reply.status(400).send({ error: 'Valore non valido per i tentativi massimi.' });
    }
  }

  let effectiveMaxAttempts = maxAttempts || 3;
  
  if (effectiveQuizType === 'ESAME') {
    effectiveMaxAttempts = 1;
  } else if (effectiveQuizType === 'PREPARAZIONE') {
    effectiveMaxAttempts = -1;
  }

  const quiz = await prisma.quiz.create({
    data: { 
      courseId, 
      title: title.trim(), 
      description: description?.trim() || null,
      quizType: effectiveQuizType as QuizType,
      maxAttempts: effectiveMaxAttempts,
      shuffleQuestions: shuffleQuestions || false,
      shuffleAnswers: shuffleAnswers || false,
      showResultsImmediately: showResultsImmediately !== false,
      passingScore: passingScore || 70,
      timeLimit: timeLimit || null,
      status: 'DRAFT',
      enableNegativePoints: false,
      negativePointsValue: 0.5
    }
  });

  return { success: true, quiz };
});

fastify.put<{ Params: QuizParams; Body: UpdateQuizBody }>('/quiz/:id', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: QuizParams; Body: UpdateQuizBody }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { id } = request.params;
  const { title, description, quizType, maxAttempts, shuffleQuestions, shuffleAnswers, showResultsImmediately, passingScore, timeLimit, status, enableNegativePoints, negativePointsValue } = request.body;
  const cookieHeader = request.headers.cookie as string;

  if (!isValidUUID(id)) {
    return reply.status(400).send({ error: 'ID quiz non valido.' });
  }

  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Accesso negato.' });
  }

  if (user.role === 'TEACHER') {
    const isOwner = await verifyQuizOwnership(id, user.userId, cookieHeader);
    if (!isOwner) {
      return reply.status(403).send({ error: 'Accesso negato.' });
    }
  }

  const existingQuiz = await prisma.quiz.findUnique({ where: { id } });
  if (!existingQuiz) {
    return reply.status(404).send({ error: 'Quiz non trovato.' });
  }

  let updateData: any = {};
  
  if (title !== undefined) {
    if (!title || title.trim() === '') {
      return reply.status(400).send({ error: 'Il titolo non può essere vuoto.' });
    }
    updateData.title = title.trim();
  }
  
  if (description !== undefined) {
    updateData.description = description?.trim() || null;
  }
  
  if (quizType !== undefined) {
    if (!validateQuizType(quizType)) {
      return reply.status(400).send({ error: 'Tipo quiz non valido.' });
    }
    let effectiveMaxAttempts = maxAttempts;
    if (quizType === 'ESAME') {
      effectiveMaxAttempts = 1;
    } else if (quizType === 'PREPARAZIONE') {
      effectiveMaxAttempts = -1;
    } else if (quizType === 'CUSTOM' && maxAttempts !== undefined) {
      effectiveMaxAttempts = maxAttempts;
    }
    updateData.quizType = quizType;
    updateData.maxAttempts = effectiveMaxAttempts;
  } else if (maxAttempts !== undefined && existingQuiz.quizType === 'CUSTOM') {
    updateData.maxAttempts = maxAttempts;
  }
  
  if (shuffleQuestions !== undefined) updateData.shuffleQuestions = shuffleQuestions;
  if (shuffleAnswers !== undefined) updateData.shuffleAnswers = shuffleAnswers;
  if (showResultsImmediately !== undefined) updateData.showResultsImmediately = showResultsImmediately;
  
  if (passingScore !== undefined) {
    try {
      validateNumberInRange(passingScore, 0, 100, 'Passing score');
    } catch {
      return reply.status(400).send({ error: 'Valore non valido per il punteggio minimo.' });
    }
    updateData.passingScore = passingScore;
  }
  
  if (timeLimit !== undefined) {
    if (timeLimit !== null) {
      try {
        validateNumberInRange(timeLimit, 60, 7200, 'Time limit');
      } catch {
        return reply.status(400).send({ error: 'Valore non valido per il limite di tempo.' });
      }
    }
    updateData.timeLimit = timeLimit;
  }
  
  if (status !== undefined) {
    if (!validateQuizStatus(status)) {
      return reply.status(400).send({ error: 'Stato non valido.' });
    }
    updateData.status = status;
  }

  if (enableNegativePoints !== undefined) updateData.enableNegativePoints = enableNegativePoints;
  if (negativePointsValue !== undefined) {
    try {
      validateNumberInRange(negativePointsValue, 0, 10, 'Punti negativi');
    } catch {
      return reply.status(400).send({ error: 'Valore non valido per i punti negativi.' });
    }
    updateData.negativePointsValue = negativePointsValue;
  }

  const quiz = await prisma.quiz.update({
    where: { id },
    data: updateData
  });

  return { success: true, quiz };
});

fastify.get<{ Params: QuizParams }>('/quiz/:id/settings', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: QuizParams }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { id } = request.params;
  const cookieHeader = request.headers.cookie as string;

  if (!isValidUUID(id)) {
    return reply.status(400).send({ error: 'ID quiz non valido.' });
  }

  if (user.role === 'TEACHER') {
    const isOwner = await verifyQuizOwnership(id, user.userId, cookieHeader);
    if (!isOwner) {
      return reply.status(403).send({ error: 'Accesso negato.' });
    }
  }

  const quiz = await prisma.quiz.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      courseId: true,
      status: true,
      quizType: true,
      maxAttempts: true,
      shuffleQuestions: true,
      shuffleAnswers: true,
      showResultsImmediately: true,
      passingScore: true,
      timeLimit: true,
      enableNegativePoints: true,
      negativePointsValue: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { questions: true, attempts: true } }
    }
  });

  if (!quiz) {
    return reply.status(404).send({ error: 'Quiz non trovato.' });
  }

  return quiz;
});

fastify.put<{ Params: QuizParams }>('/quiz/:id/publish', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: QuizParams }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { id } = request.params;
  const cookieHeader = request.headers.cookie as string;

  if (!isValidUUID(id)) {
    return reply.status(400).send({ error: 'ID quiz non valido.' });
  }

  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Accesso negato.' });
  }

  if (user.role === 'TEACHER') {
    const isOwner = await verifyQuizOwnership(id, user.userId, cookieHeader);
    if (!isOwner) {
      return reply.status(403).send({ error: 'Accesso negato.' });
    }
  }

  const quizWithQuestions = await prisma.quiz.findUnique({
    where: { id },
    include: { _count: { select: { questions: true } } }
  });

  if (!quizWithQuestions) {
    return reply.status(404).send({ error: 'Quiz non trovato.' });
  }

  if (quizWithQuestions._count.questions === 0) {
    return reply.status(400).send({ error: 'Non puoi pubblicare un quiz senza domande.' });
  }

  const quiz = await prisma.quiz.update({
    where: { id },
    data: { status: 'PUBLISHED' }
  });

  try {
    const courseResponse = await fetch(`${COURSE_SERVICE_URL}/courses/enrolled/${quiz.courseId}`, {
      headers: cookieHeader ? { 'Cookie': cookieHeader } : {}
    });
    
    if (courseResponse.ok) {
      const enrolledData = await courseResponse.json() as { students?: { userId: string }[] };
      const studentIds = enrolledData.students?.map(s => s.userId) || [];
      
      if (studentIds.length > 0) {
        await fetch(`${NOTIFICATION_SERVICE_URL}/bulk`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-internal-api-key': INTERNAL_API_KEY
          },
          body: JSON.stringify({
            userIds: studentIds,
            type: 'MESSAGE',
            title: 'Nuovo quiz disponibile',
            message: `Il quiz "${quiz.title}" è ora disponibile. Clicca per iniziare!`,
            courseId: quiz.courseId
          })
        });
      }
    }
  } catch (notifyErr) {
    fastify.log.error({ notifyErr }, 'Failed to send quiz publish notifications');
  }

  return { success: true, quiz };
});

fastify.post<{ Params: QuizParams; Body: DuplicateQuizBody }>('/quiz/:id/duplicate', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: QuizParams; Body: DuplicateQuizBody }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { id } = request.params;
  const { newTitle, newCourseId } = request.body;
  const cookieHeader = request.headers.cookie as string;

  if (!isValidUUID(id)) {
    return reply.status(400).send({ error: 'ID quiz non valido.' });
  }

  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Accesso negato.' });
  }

  const originalQuiz = await prisma.quiz.findUnique({
    where: { id },
    include: {
      questions: {
        include: { answers: true }
      }
    }
  });

  if (!originalQuiz) {
    return reply.status(404).send({ error: 'Quiz non trovato.' });
  }

  if (user.role === 'TEACHER') {
    const canAccessSource = await verifyQuizOwnership(id, user.userId, cookieHeader);
    if (!canAccessSource) {
      return reply.status(403).send({ error: 'Non puoi accedere a questo quiz.' });
    }

    const targetCourseId = newCourseId || originalQuiz.courseId;
    const isOwner = await checkCourseOwnership(user.userId, targetCourseId, cookieHeader);
    if (!isOwner) {
      return reply.status(403).send({ error: 'Non puoi duplicare quiz per altri corsi.' });
    }
  }

  const quizToCreate = {
    courseId: newCourseId || originalQuiz.courseId,
    title: newTitle || `${originalQuiz.title} (Copia)`,
    description: originalQuiz.description,
    quizType: originalQuiz.quizType,
    maxAttempts: originalQuiz.maxAttempts,
    shuffleQuestions: originalQuiz.shuffleQuestions,
    shuffleAnswers: originalQuiz.shuffleAnswers,
    showResultsImmediately: originalQuiz.showResultsImmediately,
    passingScore: originalQuiz.passingScore,
    timeLimit: originalQuiz.timeLimit,
    status: 'DRAFT' as const
  };

  const duplicatedQuiz = await prisma.quiz.create({
    data: quizToCreate,
    include: {
      questions: {
        include: { answers: true }
      }
    }
  });

  const questionDuplication = await Promise.all(
    originalQuiz.questions.map(async (question, index) => {
      const newQuestion = await prisma.question.create({
        data: {
          quizId: duplicatedQuiz.id,
          text: question.text,
          order: index,
          questionType: question.questionType,
          points: question.points,
          negativePoints: question.negativePoints || 0
        }
      });

      if (question.questionType === 'MULTIPLE_CHOICE' && question.answers.length > 0) {
        await prisma.answer.createMany({
          data: question.answers.map((answer, answerIndex) => ({
            questionId: newQuestion.id,
            text: answer.text,
            isCorrect: answer.isCorrect,
            order: answerIndex,
            points: answer.points || 1
          }))
        });
      }

      return newQuestion;
    })
  );

  const finalQuiz = await prisma.quiz.findUnique({
    where: { id: duplicatedQuiz.id },
    include: {
      questions: {
        include: { answers: true }
      }
    }
  });

  return { success: true, quiz: finalQuiz };
});

fastify.post<{ Params: QuizParams; Body: AddQuestionBody }>('/quiz/:id/questions', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: QuizParams; Body: AddQuestionBody }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { id } = request.params;
  const { text, questionType, points, negativePoints, answers } = request.body;
  const cookieHeader = request.headers.cookie as string;

  if (!isValidUUID(id)) {
    return reply.status(400).send({ error: 'ID quiz non valido.' });
  }

  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Accesso negato.' });
  }

  if (user.role === 'TEACHER') {
    const isOwner = await verifyQuizOwnership(id, user.userId, cookieHeader);
    if (!isOwner) {
      return reply.status(403).send({ error: 'Accesso negato.' });
    }
  }

  if (!text || text.trim() === '') {
    return reply.status(400).send({ error: 'Il testo della domanda è obbligatorio.' });
  }

  const effectiveQuestionType = (questionType && validateQuestionType(questionType)) ? questionType : 'MULTIPLE_CHOICE';
  
  if (effectiveQuestionType === 'MULTIPLE_CHOICE') {
    if (!answers || !Array.isArray(answers) || answers.length < 2) {
      return reply.status(400).send({ error: 'Una domanda a scelta multipla deve avere almeno 2 risposte.' });
    }
    
    const hasCorrect = answers.some((a: any) => a.isCorrect === true);
    if (!hasCorrect) {
      return reply.status(400).send({ error: 'Deve esserci almeno una risposta corretta.' });
    }
  }

  if (points !== undefined) {
    try {
      validateNumberInRange(points, 1, 100, 'Points');
    } catch {
      return reply.status(400).send({ error: 'Valore non valido per i punti della domanda.' });
    }
  }

  let effectiveNegativePoints = 0;
  if (negativePoints !== undefined) {
    const negPoints = negativePoints;
    if (negPoints < 0) {
      return reply.status(400).send({ error: 'I punti negativi devono essere un numero >= 0.' });
    }
    if (points !== undefined && negPoints > points) {
      return reply.status(400).send({ error: 'I punti negativi non possono superare i punti della domanda.' });
    }
    effectiveNegativePoints = negPoints;
  }

  const questionCount = await prisma.question.count({ where: { quizId: id } });

  const question = await prisma.question.create({
    data: {
      quizId: id,
      text: text.trim(),
      order: questionCount,
      questionType: effectiveQuestionType as QuestionType,
      points: points || 1,
      negativePoints: effectiveNegativePoints,
      answers: effectiveQuestionType === 'MULTIPLE_CHOICE' && answers ? {
        create: answers.map((a, idx) => ({
          text: a.text?.trim() || '',
          isCorrect: a.isCorrect || false,
          order: idx,
          points: a.points || 1
        }))
      } : undefined
    },
    include: { answers: true }
  });

  return { success: true, question };
});

fastify.put<{ Params: QuestionParams; Body: UpdateQuestionBody }>('/quiz/:id/questions/:questionId', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: QuestionParams; Body: UpdateQuestionBody }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { id, questionId } = request.params;
  const { text, questionType, points, negativePoints } = request.body;
  const cookieHeader = request.headers.cookie as string;

  if (!isValidUUID(id) || !isValidUUID(questionId)) {
    return reply.status(400).send({ error: 'ID non valido.' });
  }

  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Accesso negato.' });
  }

  if (user.role === 'TEACHER') {
    const isOwner = await verifyQuizOwnership(id, user.userId, cookieHeader);
    if (!isOwner) {
      return reply.status(403).send({ error: 'Accesso negato.' });
    }
  }

  const question = await prisma.question.findFirst({
    where: { id: questionId, quizId: id }
  });

  if (!question) {
    return reply.status(404).send({ error: 'Domanda non trovata.' });
  }

  let updateData: any = {};
  if (text !== undefined) {
    if (!text || text.trim() === '') {
      return reply.status(400).send({ error: 'Il testo non può essere vuoto.' });
    }
    updateData.text = text.trim();
  }
  if (questionType !== undefined) {
    if (!validateQuestionType(questionType)) {
      return reply.status(400).send({ error: 'Tipo domanda non valido.' });
    }
    updateData.questionType = questionType;
  }
  if (points !== undefined) {
    try {
      validateNumberInRange(points, 1, 100, 'Points');
    } catch {
      return reply.status(400).send({ error: 'Valore non valido per i punti della domanda.' });
    }
    updateData.points = points;
  }
  if (negativePoints !== undefined) {
    const negPoints = negativePoints;
    if (negPoints < 0) {
      return reply.status(400).send({ error: 'I punti negativi devono essere un numero >= 0.' });
    }
    if (points !== undefined && negPoints > points) {
      return reply.status(400).send({ error: 'I punti negativi non possono superare i punti della domanda.' });
    }
    updateData.negativePoints = negPoints;
  }

  const updated = await prisma.question.update({
    where: { id: questionId },
    data: updateData,
    include: { answers: true }
  });

  return { success: true, question: updated };
});

fastify.delete<{ Params: QuestionParams }>('/quiz/:id/questions/:questionId', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: QuestionParams }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { id, questionId } = request.params;
  const cookieHeader = request.headers.cookie as string;

  if (!isValidUUID(id) || !isValidUUID(questionId)) {
    return reply.status(400).send({ error: 'ID non valido.' });
  }

  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Accesso negato.' });
  }

  if (user.role === 'TEACHER') {
    const isOwner = await verifyQuizOwnership(id, user.userId, cookieHeader);
    if (!isOwner) {
      return reply.status(403).send({ error: 'Accesso negato.' });
    }
  }

  const question = await prisma.question.findFirst({
    where: { id: questionId, quizId: id }
  });

  if (!question) {
    return reply.status(404).send({ error: 'Domanda non trovata.' });
  }

  await prisma.question.delete({ where: { id: questionId } });

  return { success: true };
});

fastify.post<{ Params: QuestionParams; Body: AddAnswerBody }>('/quiz/:id/questions/:questionId/answers', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: QuestionParams; Body: AddAnswerBody }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { id, questionId } = request.params;
  const { text, isCorrect, points } = request.body;
  const cookieHeader = request.headers.cookie as string;

  if (!isValidUUID(id) || !isValidUUID(questionId)) {
    return reply.status(400).send({ error: 'ID non valido.' });
  }

  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Accesso negato.' });
  }

  if (user.role === 'TEACHER') {
    const isOwner = await verifyQuizOwnership(id, user.userId, cookieHeader);
    if (!isOwner) {
      return reply.status(403).send({ error: 'Accesso negato.' });
    }
  }

  const question = await prisma.question.findFirst({
    where: { id: questionId, quizId: id }
  });

  if (!question) {
    return reply.status(404).send({ error: 'Domanda non trovata.' });
  }

  if (question.questionType !== 'MULTIPLE_CHOICE') {
    return reply.status(400).send({ error: 'Non puoi aggiungere risposte a una domanda a risposta aperta.' });
  }

  if (!text || text.trim() === '') {
    return reply.status(400).send({ error: 'Il testo della risposta è obbligatorio.' });
  }

  const answerCount = await prisma.answer.count({ where: { questionId } });
  if (answerCount >= 6) {
    return reply.status(400).send({ error: 'Massimo 6 risposte per domanda.' });
  }

  const answer = await prisma.answer.create({
    data: {
      questionId,
      text: text.trim(),
      isCorrect: isCorrect || false,
      order: answerCount,
      points: points || 1
    }
  });

  return { success: true, answer };
});

fastify.put<{ Params: AnswerParams; Body: UpdateAnswerBody }>('/quiz/:id/questions/:questionId/answers/:answerId', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: AnswerParams; Body: UpdateAnswerBody }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { id, questionId, answerId } = request.params;
  const { text, isCorrect, points } = request.body;
  const cookieHeader = request.headers.cookie as string;

  if (!isValidUUID(id) || !isValidUUID(questionId) || !isValidUUID(answerId)) {
    return reply.status(400).send({ error: 'ID non valido.' });
  }

  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Accesso negato.' });
  }

  if (user.role === 'TEACHER') {
    const isOwner = await verifyQuizOwnership(id, user.userId, cookieHeader);
    if (!isOwner) {
      return reply.status(403).send({ error: 'Accesso negato.' });
    }
  }

  const answer = await prisma.answer.findFirst({
    where: { id: answerId, questionId }
  });

  if (!answer) {
    return reply.status(404).send({ error: 'Risposta non trovata.' });
  }

  let updateData: any = {};
  if (text !== undefined) {
    if (!text || text.trim() === '') {
      return reply.status(400).send({ error: 'Il testo non può essere vuoto.' });
    }
    updateData.text = text.trim();
  }
  if (isCorrect !== undefined) updateData.isCorrect = isCorrect;
  if (points !== undefined) {
    try {
      validateNumberInRange(points, 1, 100, 'Points');
    } catch {
      return reply.status(400).send({ error: 'Valore non valido per i punti della risposta.' });
    }
    updateData.points = points;
  }

  const updated = await prisma.answer.update({
    where: { id: answerId },
    data: updateData
  });

  return { success: true, answer: updated };
});

fastify.delete<{ Params: AnswerParams }>('/quiz/:id/questions/:questionId/answers/:answerId', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: AnswerParams }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { id, questionId, answerId } = request.params;
  const cookieHeader = request.headers.cookie as string;

  if (!isValidUUID(id) || !isValidUUID(questionId) || !isValidUUID(answerId)) {
    return reply.status(400).send({ error: 'ID non valido.' });
  }

  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Accesso negato.' });
  }

  if (user.role === 'TEACHER') {
    const isOwner = await verifyQuizOwnership(id, user.userId, cookieHeader);
    if (!isOwner) {
      return reply.status(403).send({ error: 'Accesso negato.' });
    }
  }

  const answer = await prisma.answer.findFirst({
    where: { id: answerId, questionId }
  });

  if (!answer) {
    return reply.status(404).send({ error: 'Risposta non trovata.' });
  }

  await prisma.answer.delete({ where: { id: answerId } });

  return { success: true };
});

fastify.post<{ Params: QuizParams }>('/quiz/:id/start', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: QuizParams }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { id } = request.params;
  const cookieHeader = request.headers.cookie as string;

  if (!isValidUUID(id)) {
    return reply.status(400).send({ error: 'ID quiz non valido.' });
  }

  const quiz = await prisma.quiz.findUnique({ where: { id }, select: { id: true, courseId: true, status: true, maxAttempts: true, title: true, timeLimit: true } });
  if (!quiz || quiz.status !== 'PUBLISHED') {
    return reply.status(404).send({ error: 'Quiz non disponibile.' });
  }

  const hasAccess = await checkCourseEnrollment(user.userId, quiz.courseId, cookieHeader);
  if (!hasAccess) {
    return reply.status(403).send({ error: 'Non sei iscritto a questo corso.' });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1::text))`, id);
      const existingAttempts = await tx.attempt.count({
        where: { quizId: id, studentId: user.userId }
      });

      if (quiz.maxAttempts > 0 && existingAttempts >= quiz.maxAttempts) {
        throw new Error('MAX_ATTEMPTS_REACHED');
      }

      const attempt = await tx.attempt.create({
        data: {
          studentId: user.userId,
          quizId: id,
          startedAt: new Date(),
          maxScore: 0
        }
      });

      return attempt;
    });

    return { 
      success: true, 
      attempt: { 
        id: result.id, 
        quizId: result.quizId,
        studentId: result.studentId,
        startedAt: result.startedAt,
        timeLimit: quiz.timeLimit
      }
    };
  } catch (err: unknown) {
    const e = err as Error;
    if (e.message === 'MAX_ATTEMPTS_REACHED') {
      return reply.status(403).send({ error: 'Hai esaurito i tentativi per questo quiz.' });
    }
    fastify.log.error({ err: e }, 'Error starting quiz');
    return reply.status(400).send({ error: 'Errore durante l\'avvio del quiz.' });
  }
});

fastify.post<{ Params: QuizParams; Body: SubmitQuizBody }>('/quiz/:id/submit', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: QuizParams; Body: SubmitQuizBody }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { id } = request.params;
  const { attemptId, questionSubmissions } = request.body;
  const cookieHeader = request.headers.cookie as string;

  if (!isValidUUID(id)) {
    return reply.status(400).send({ error: 'ID quiz non valido.' });
  }

  if (!questionSubmissions) {
    return reply.status(400).send({ error: 'Devi fornire le risposte.' });
  }

  if (!attemptId || !isValidUUID(attemptId)) {
    return reply.status(400).send({ error: 'ID tentativo non valido. Avvia il quiz prima di inviarlo.' });
  }

  const quiz = await prisma.quiz.findUnique({
    where: { id },
    include: {
      questions: {
        include: { answers: true }
      }
    }
  });

  if (!quiz || quiz.status !== 'PUBLISHED') {
    return reply.status(404).send({ error: 'Quiz non disponibile.' });
  }

  const hasAccess = await checkCourseEnrollment(user.userId, quiz.courseId, cookieHeader);
  if (!hasAccess) {
    return reply.status(403).send({ error: 'Non sei iscritto a questo corso.' });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1::text))`, id);

      const existingAttempt = await tx.attempt.findUnique({
        where: { id: attemptId }
      });

      if (!existingAttempt) {
        throw new Error('ATTEMPT_NOT_FOUND');
      }

      if (existingAttempt.studentId !== user.userId) {
        throw new Error('ATTEMPT_NOT_YOURS');
      }

      if (existingAttempt.quizId !== id) {
        throw new Error('ATTEMPT_WRONG_QUIZ');
      }

      if (existingAttempt.completedAt) {
        throw new Error('ATTEMPT_ALREADY_SUBMITTED');
      }

      const existingAttempts = await tx.attempt.count({
        where: { quizId: id, studentId: user.userId }
      });

      if (quiz.maxAttempts > 0 && existingAttempts > quiz.maxAttempts) {
        throw new Error('MAX_ATTEMPTS_REACHED');
      }

      const timeLimit = quiz.timeLimit || 0;
      if (timeLimit > 0) {
        const startedAt = existingAttempt.startedAt?.getTime();
        if (startedAt) {
          const elapsedMs = Date.now() - startedAt;
          const limitMs = timeLimit * 60 * 1000;
          if (elapsedMs > limitMs) {
            throw new Error('TIME_LIMIT_EXCEEDED');
          }
        }
      }

      if (!Array.isArray(questionSubmissions)) {
        throw new Error('INVALID_SUBMISSIONS_FORMAT');
      }

      const seenQuestions = new Set<string>();
      let totalScore = 0;
      const allQuestions = quiz.questions;
      const answeredQuestions = new Set<string>();

      for (const sub of questionSubmissions) {
        if (seenQuestions.has(sub.questionId)) {
          throw new Error('DUPLICATE_QUESTION');
        }
        seenQuestions.add(sub.questionId);

        if (!sub.questionId || !isValidUUID(sub.questionId)) {
          throw new Error('INVALID_QUESTION_ID');
        }

        const question = allQuestions.find((q: any) => q.id === sub.questionId);
        if (!question) {
          throw new Error('QUESTION_NOT_IN_QUIZ');
        }

        answeredQuestions.add(sub.questionId);

        if (question.questionType === 'MULTIPLE_CHOICE') {
          let points = 0;
          let answerId: string | null = null;
          let gradingStatus: string = 'ACCEPTED';

          if (sub.answerId && isValidUUID(sub.answerId)) {
            const validAnswerIds = question.answers.map((a: any) => a.id);
            if (!validAnswerIds.includes(sub.answerId)) {
              throw new Error('INVALID_ANSWER');
            }
            answerId = sub.answerId;
            const selectedAnswer = question.answers.find((a: any) => a.id === sub.answerId);
            const negPoints = quiz.enableNegativePoints ? quiz.negativePointsValue : 0;
            if (selectedAnswer?.isCorrect) {
              points = question.points;
            } else if (negPoints > 0) {
              points = -negPoints;
            }
          }

          totalScore += points;

          await tx.questionSubmission.create({
            data: {
              attemptId: existingAttempt.id,
              questionId: question.id,
              answerId,
              points,
              gradingStatus: gradingStatus as GradingStatus
            }
          });
        } else {
          await tx.questionSubmission.create({
            data: {
              attemptId: existingAttempt.id,
              questionId: question.id,
              textAnswer: sub.textAnswer || '',
              points: 0,
              gradingStatus: 'PENDING'
            }
          });
        }
      }

      const maxScore = allQuestions.reduce((sum: number, q: any) => sum + q.points, 0);

      for (const question of allQuestions) {
        if (!answeredQuestions.has(question.id)) {
          const gradingStatus = question.questionType === 'OPEN_ANSWER' ? 'PENDING' : 'ACCEPTED';
          await tx.questionSubmission.create({
            data: {
              attemptId: existingAttempt.id,
              questionId: question.id,
              points: 0,
              gradingStatus
            }
          });
        }
      }

      totalScore = Math.max(0, totalScore);
      const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

      const hasOpenAnswerQuestions = quiz.questions.some((q: any) => q.questionType === 'OPEN_ANSWER');
      const gradingComplete = !hasOpenAnswerQuestions;
      const needsGrading = hasOpenAnswerQuestions;
      const finalPassed: boolean | null = gradingComplete ? percentage >= quiz.passingScore : null;

      await tx.attempt.update({
        where: { id: existingAttempt.id },
        data: {
          score: totalScore,
          maxScore,
          percentage,
          passed: finalPassed,
          completedAt: new Date(),
          gradedAt: gradingComplete ? new Date() : null
        }
      });

      return { 
        attempt: existingAttempt, 
        totalScore, 
        maxScore, 
        percentage,
        passed: finalPassed,
        needsGrading
      };
    });

    return { 
      success: true, 
      attempt: { 
        id: result.attempt.id, 
        score: result.totalScore, 
        maxScore: result.maxScore, 
        percentage: result.percentage,
        passed: result.passed,
        showResultsImmediately: quiz.showResultsImmediately,
        needsGrading: result.needsGrading
      }
    };
  } catch (err: unknown) {
    const e = err as Error;
    if (e.message === 'MAX_ATTEMPTS_REACHED') {
      return reply.status(403).send({ error: 'Hai esaurito i tentativi per questo quiz.' });
    }
    if (e.message === 'TIME_LIMIT_EXCEEDED') {
      return reply.status(400).send({ error: 'Tempo scaduto. Il quiz è stato automaticamente concluso.' });
    }
    if (e.message === 'DUPLICATE_QUESTION') {
      return reply.status(400).send({ error: 'Domanda duplicata nella submission.' });
    }
    if (e.message === 'ATTEMPT_NOT_FOUND') {
      return reply.status(404).send({ error: 'Tentativo non trovato.' });
    }
    if (e.message === 'ATTEMPT_NOT_YOURS') {
      return reply.status(403).send({ error: 'Questo tentativo non ti appartiene.' });
    }
    if (e.message === 'ATTEMPT_WRONG_QUIZ') {
      return reply.status(400).send({ error: 'Il tentativo non appartiene a questo quiz.' });
    }
    if (e.message === 'ATTEMPT_ALREADY_SUBMITTED') {
      return reply.status(400).send({ error: 'Questo tentativo è già stato inviato.' });
    }
    fastify.log.error({ err: e }, 'Error submitting quiz');
    return reply.status(400).send({ error: 'Errore durante la sottomissione.' });
  }
});

fastify.get<{ Params: QuizParams }>('/quiz/:id/results', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: QuizParams }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { id } = request.params;

  if (!isValidUUID(id)) {
    return reply.status(400).send({ error: 'ID quiz non valido.' });
  }

  const quiz = await prisma.quiz.findUnique({
    where: { id },
    select: { passingScore: true, title: true, showResultsImmediately: true }
  });

  if (!quiz) {
    return reply.status(404).send({ error: 'Quiz non trovato.' });
  }

  const isTeacherOrAdmin = user.role === 'TEACHER' || user.role === 'ADMIN';

  const attempts = await prisma.attempt.findMany({
    where: { quizId: id, studentId: user.userId },
    orderBy: { createdAt: 'desc' },
    include: {
      submissions: {
        include: {
          question: { select: { id: true, text: true, questionType: true, points: true } },
          answer: { select: { id: true, text: true, isCorrect: true } }
        }
      }
    }
  });

  return {
    attempts: attempts.map(a => {
      return {
        ...a,
        submissions: a.submissions.map(s => {
          const showCorrect = isTeacherOrAdmin
            || (quiz.showResultsImmediately && s.gradingStatus === 'ACCEPTED');
          return {
            ...s,
            answer: s.answer && showCorrect
              ? { id: s.answer.id, text: s.answer.text, isCorrect: s.answer.isCorrect }
              : s.answer
                ? { id: s.answer.id, text: s.answer.text }
                : null,
            feedback: s.feedback
          };
        })
      };
    }),
    quiz: { passingScore: quiz.passingScore }
  };
});

fastify.get('/quiz/student/history', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  
  if (user.role === 'TEACHER' || user.role === 'ADMIN') {
    return reply.status(403).send({ error: 'Accesso negato.' });
  }

  const attempts = await prisma.attempt.findMany({
    where: { studentId: user.userId },
    orderBy: { createdAt: 'desc' },
    include: {
      quiz: {
        select: {
          id: true,
          title: true,
          courseId: true,
          quizType: true,
          maxAttempts: true,
          passingScore: true,
          showResultsImmediately: true
        }
      },
      submissions: {
        include: {
          question: { select: { id: true, text: true, questionType: true, points: true } },
          answer: { select: { id: true, text: true, isCorrect: true } }
        }
      }
    }
  });

  const groupedByQuiz = attempts.reduce((acc: any, attempt: any) => {
    const quizId = attempt.quiz.id;
    if (!acc[quizId]) {
      acc[quizId] = {
        quiz: attempt.quiz,
        attempts: [],
        totalAttempts: 0,
        bestPercentage: 0,
        hasPassed: false
      };
    }
    const hasPendingGrading = attempt.submissions?.some(
      (s: any) => s.gradingStatus === 'PENDING' || s.gradingStatus === 'NEEDS_REVIEW'
    ) || false;
    acc[quizId].attempts.push({
      id: attempt.id,
      score: attempt.score,
      maxScore: attempt.maxScore,
      percentage: attempt.percentage,
      passed: attempt.passed,
      completedAt: attempt.completedAt,
      gradedAt: attempt.gradedAt,
      needsGrading: hasPendingGrading,
      submissions: attempt.submissions.map((s: any) => {
        const showCorrect = attempt.quiz.showResultsImmediately && s.gradingStatus === 'ACCEPTED';
        return {
          ...s,
          answer: s.answer && showCorrect
            ? { id: s.answer.id, text: s.answer.text, isCorrect: s.answer.isCorrect }
            : s.answer
              ? { id: s.answer.id, text: s.answer.text }
              : null,
          feedback: s.feedback
        };
      })
    });
    acc[quizId].totalAttempts += 1;
    if (attempt.percentage && attempt.percentage > acc[quizId].bestPercentage) {
      acc[quizId].bestPercentage = attempt.percentage;
    }
    if (attempt.passed === true) {
      acc[quizId].hasPassed = true;
    }
    return acc;
  }, {});

  const history = Object.values(groupedByQuiz);

  return { history };
});

fastify.get<{ Params: QuizParams; Querystring: AttemptsQuery }>('/quiz/:id/attempts', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: QuizParams; Querystring: AttemptsQuery }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { id } = request.params;
  const { page = '1', limit = '10' } = request.query;
  const cookieHeader = request.headers.cookie as string;

  if (!isValidUUID(id)) {
    return reply.status(400).send({ error: 'ID quiz non valido.' });
  }

  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Accesso negato.' });
  }

  if (user.role === 'TEACHER') {
    const isOwner = await verifyQuizOwnership(id, user.userId, cookieHeader);
    if (!isOwner) {
      return reply.status(403).send({ error: 'Accesso negato.' });
    }
  }

  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
  const skip = (pageNum - 1) * limitNum;

  const [total, attempts] = await Promise.all([
    prisma.attempt.count({ where: { quizId: id } }),
    prisma.attempt.findMany({
      where: { quizId: id },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum,
      include: {
        submissions: {
          include: {
            question: true,
            answer: true
          }
        }
      }
    })
  ]);

  const studentIds = [...new Set(attempts.map(a => a.studentId))];
  const studentNames: Record<string, string> = {};
  
  if (studentIds.length > 0) {
    try {
      const usersResponse = await fetch(`${AUTH_SERVICE_URL}/users/batch`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-internal-api-key': INTERNAL_API_KEY
        },
        body: JSON.stringify({ ids: studentIds })
      });
      if (usersResponse.ok) {
        const usersData = await usersResponse.json() as { users?: { id: string; firstName?: string | null; lastName?: string | null; email?: string }[] };
        usersData.users?.forEach(u => {
          const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ');
          studentNames[u.id] = fullName || u.email || 'Studente';
        });
      }
    } catch (e) {
      fastify.log.error(e, 'Failed to fetch student names');
    }
  }

  const attemptsWithStudentName = attempts.map(attempt => ({
    ...attempt,
    studentName: studentNames[attempt.studentId] || 'Studente'
  }));

  return {
    attempts: attemptsWithStudentName,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum)
    }
  };
});

fastify.get<{ Params: QuizParams }>('/quiz/:id/attempts/pending-grading', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: QuizParams }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { id } = request.params;
  const cookieHeader = request.headers.cookie as string;

  if (!isValidUUID(id)) {
    return reply.status(400).send({ error: 'ID quiz non valido.' });
  }

  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Accesso negato.' });
  }

  if (user.role === 'TEACHER') {
    const isOwner = await verifyQuizOwnership(id, user.userId, cookieHeader);
    if (!isOwner) {
      return reply.status(403).send({ error: 'Accesso negato.' });
    }
  }

  const attemptsWithPending = await prisma.attempt.findMany({
    where: { 
      quizId: id,
      submissions: {
        some: {
          gradingStatus: { in: ['PENDING', 'NEEDS_REVIEW'] }
        }
      }
    },
    include: {
      submissions: {
        where: {
          gradingStatus: { in: ['PENDING', 'NEEDS_REVIEW'] }
        },
        include: {
          question: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  return { attempts: attemptsWithPending };
});

fastify.get<{ Params: QuizParams; Querystring: IncludeGradedQuery }>('/quiz/:id/attempts/all', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: QuizParams; Querystring: IncludeGradedQuery }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { id } = request.params;
  const { includeGraded } = request.query;
  const cookieHeader = request.headers.cookie as string;

  if (!isValidUUID(id)) {
    return reply.status(400).send({ error: 'ID quiz non valido.' });
  }

  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Accesso negato.' });
  }

  if (user.role === 'TEACHER') {
    const isOwner = await verifyQuizOwnership(id, user.userId, cookieHeader);
    if (!isOwner) {
      return reply.status(403).send({ error: 'Accesso negato.' });
    }
  }

  const whereClause: Record<string, unknown> = { quizId: id };
  const includeAll = includeGraded === 'true';
  
  const attempts = await prisma.attempt.findMany({
    where: includeAll ? whereClause : {
      ...whereClause,
      submissions: {
        some: {
          gradingStatus: { in: ['PENDING', 'NEEDS_REVIEW'] }
        }
      }
    },
    include: {
      submissions: {
        include: {
          question: true,
          answer: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  return { attempts };
});

fastify.put<{ Params: AttemptParams; Body: GradeSubmissionBody }>('/quiz/:id/attempts/:attemptId/grade/:submissionId', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: AttemptParams; Body: GradeSubmissionBody }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { id, attemptId, submissionId } = request.params;
  const { points, feedback, status } = request.body;
  const cookieHeader = request.headers.cookie as string;

  if (!isValidUUID(id) || !isValidUUID(attemptId) || !isValidUUID(submissionId)) {
    return reply.status(400).send({ error: 'ID non valido.' });
  }

  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Accesso negato.' });
  }

  if (user.role === 'TEACHER') {
    const isOwner = await verifyQuizOwnership(id, user.userId, cookieHeader);
    if (!isOwner) {
      return reply.status(403).send({ error: 'Accesso negato.' });
    }
  }

  const submission = await prisma.questionSubmission.findFirst({
    where: { id: submissionId, attemptId },
    include: { question: true }
  });

  if (!submission) {
    return reply.status(404).send({ error: 'Invio non trovato.' });
  }

  const question = submission.question;
  const maxPoints = question.points;

  let newPoints = points;
  
  if (question.questionType === 'MULTIPLE_CHOICE') {
    if (newPoints === undefined || newPoints === null) {
      newPoints = submission.points || 0;
    }
  } else {
    if (newPoints === undefined) {
      newPoints = 0;
    }
  }
  
  if (typeof newPoints !== 'number' || isNaN(newPoints) || newPoints < 0) {
    return reply.status(400).send({ error: 'Punti non validi.' });
  }
  if (newPoints > maxPoints) {
    return reply.status(400).send({ error: `I punti non possono superare ${maxPoints}.` });
  }

  const validStatuses = ['ACCEPTED', 'REJECTED', 'PENDING', 'NEEDS_REVIEW'];
  const newStatus = (status && validStatuses.includes(status)) ? status : 'ACCEPTED';

  await prisma.questionSubmission.update({
    where: { id: submissionId },
    data: {
      points: newPoints,
      feedback: feedback || null,
      gradingStatus: newStatus as GradingStatus,
      gradedAt: new Date(),
      gradedBy: user.userId
    }
  });

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: {
      submissions: true,
      quiz: {
        include: {
          questions: true
        }
      }
    }
  });

  if (!attempt || !attempt.quiz) {
    return reply.status(404).send({ error: 'Tentativo non trovato.' });
  }

  if (!attempt.quiz.questions || attempt.quiz.questions.length === 0) {
    return reply.status(400).send({ error: 'Quiz senza domande.' });
  }

  const totalScore = attempt.submissions.reduce((sum: number, s: any) => sum + (s.points || 0), 0);
  const maxScore = attempt.quiz.questions.reduce((sum: number, q: any) => sum + (q.points || 0), 0);
  const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

  const pendingGrading = attempt.submissions.filter((s: any) => 
    s.gradingStatus === 'PENDING' || s.gradingStatus === 'NEEDS_REVIEW'
  );

  const finalPassed = pendingGrading.length === 0 
    ? percentage >= attempt.quiz.passingScore 
    : null;

  await prisma.attempt.update({
    where: { id: attemptId },
    data: {
      score: totalScore,
      maxScore,
      percentage,
      passed: finalPassed,
      gradedAt: pendingGrading.length === 0 ? new Date() : undefined
    }
  });

  if (pendingGrading.length === 0) {
    try {
      const attempt = await prisma.attempt.findUnique({
        where: { id: attemptId },
        include: { quiz: true }
      });
      
      if (attempt) {
        await fetch(`${NOTIFICATION_SERVICE_URL}/bulk`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-api-key': INTERNAL_API_KEY
          },
          body: JSON.stringify({
            userIds: [attempt.studentId],
            type: 'MESSAGE',
            title: 'Quiz valutato',
            message: `Il quiz "${attempt.quiz.title}" è stato valutato. Clicca per vedere il risultato!`,
            courseId: attempt.quiz.courseId
          })
        });
      }
    } catch (notifyErr) {
      fastify.log.error({ notifyErr }, 'Failed to send grading notification');
    }
  }

  return { success: true };
});

fastify.put<{ Params: AttemptParams; Body: FeedbackBody }>('/quiz/:id/attempts/:attemptId/submissions/:submissionId/feedback', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: AttemptParams; Body: FeedbackBody }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { id, attemptId, submissionId } = request.params;
  const { points, feedback } = request.body;
  const cookieHeader = request.headers.cookie as string;

  if (!isValidUUID(id) || !isValidUUID(attemptId) || !isValidUUID(submissionId)) {
    return reply.status(400).send({ error: 'ID non valido.' });
  }

  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Accesso negato.' });
  }

  if (user.role === 'TEACHER') {
    const isOwner = await verifyQuizOwnership(id, user.userId, cookieHeader);
    if (!isOwner) {
      return reply.status(403).send({ error: 'Accesso negato.' });
    }
  }

  const submission = await prisma.questionSubmission.findFirst({
    where: { id: submissionId, attemptId },
    include: { question: true }
  });

  if (!submission) {
    return reply.status(404).send({ error: 'Invio non trovato.' });
  }

  const question = submission.question;
  let newPoints = submission.points;
  
  if (points !== undefined && points !== null) {
    if (typeof points !== 'number' || isNaN(points) || points < 0) {
      return reply.status(400).send({ error: 'Punti non validi.' });
    }
    if (points > question.points) {
      return reply.status(400).send({ error: `I punti non possono superare ${question.points}.` });
    }
    newPoints = points;
  }

  const updateData: any = {
    feedback: feedback !== undefined ? (feedback || null) : submission.feedback,
    gradedAt: new Date(),
    gradedBy: user.userId
  };
  
  if (points !== undefined && points !== null) {
    updateData.points = points;
    updateData.gradingStatus = 'ACCEPTED';
  }

  await prisma.questionSubmission.update({
    where: { id: submissionId },
    data: updateData
  });

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: {
      submissions: true,
      quiz: {
        include: {
          questions: true
        }
      }
    }
  });

  if (!attempt || !attempt.quiz) {
    return reply.status(404).send({ error: 'Tentativo non trovato.' });
  }

  if (!attempt.quiz.questions || attempt.quiz.questions.length === 0) {
    return reply.status(400).send({ error: 'Quiz senza domande.' });
  }

  const totalScore = attempt.submissions.reduce((sum: number, s: any) => sum + (s.points || 0), 0);
  const maxScore = attempt.quiz.questions.reduce((sum: number, q: any) => sum + (q.points || 0), 0);
  const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

  const pendingGrading = attempt.submissions.filter((s: any) => 
    s.gradingStatus === 'PENDING' || s.gradingStatus === 'NEEDS_REVIEW'
  );

  const finalPassed = pendingGrading.length === 0 
    ? percentage >= attempt.quiz.passingScore 
    : null;

  await prisma.attempt.update({
    where: { id: attemptId },
    data: {
      score: totalScore,
      maxScore,
      percentage,
      passed: finalPassed,
      gradedAt: pendingGrading.length === 0 ? new Date() : undefined
    }
  });

  return { success: true };
});

fastify.get<{ Params: QuizParams }>('/quiz/:id/stats', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest<{ Params: QuizParams }>, reply: FastifyReply) => {
  const user = request.user as AuthUser;
  const { id } = request.params;
  const cookieHeader = request.headers.cookie as string;

  if (!isValidUUID(id)) {
    return reply.status(400).send({ error: 'ID quiz non valido.' });
  }

  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Accesso negato.' });
  }

  if (user.role === 'TEACHER') {
    const isOwner = await verifyQuizOwnership(id, user.userId, cookieHeader);
    if (!isOwner) {
      return reply.status(403).send({ error: 'Accesso negato.' });
    }
  }

  const attempts = await prisma.attempt.findMany({
    where: { quizId: id },
    select: {
      score: true,
      maxScore: true,
      percentage: true,
      passed: true,
      completedAt: true
    }
  });

  const quiz = await prisma.quiz.findUnique({
    where: { id },
    include: { _count: { select: { questions: true, attempts: true } } }
  });

  if (!quiz) {
    return reply.status(404).send({ error: 'Quiz non trovato.' });
  }

  const completedAttempts = attempts.filter(a => a.completedAt !== null);
  const passedAttempts = attempts.filter(a => a.passed === true);

  const averagePercentage = completedAttempts.length > 0
    ? Math.round(completedAttempts.reduce((sum, a) => sum + (a.percentage || 0), 0) / completedAttempts.length)
    : 0;

  const passRate = completedAttempts.length > 0
    ? Math.round((passedAttempts.length / completedAttempts.length) * 100)
    : 0;

  return {
    quiz: {
      id: quiz.id,
      title: quiz.title,
      totalQuestions: quiz._count.questions,
      totalAttempts: quiz._count.attempts
    },
    stats: {
      totalAttempts: completedAttempts.length,
      passedAttempts: passedAttempts.length,
      averagePercentage,
      passRate
    }
  };
});

fastify.get('/quiz/my-courses-quizzes', { preValidation: [fastify.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
  const user = request.user as AuthUser;

  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Solo docenti possono vedere questa pagina.' });
  }

  let courses: CourseSummary[] = [];
  const cookieHeader = request.headers.cookie;
  
  if (user.role === 'TEACHER') {
    try {
      const response = await fetch(`${COURSE_SERVICE_URL}/my-courses`, {
        headers: cookieHeader ? { 'Cookie': cookieHeader } : {}
      });
      if (response.ok) {
        courses = (await response.json()) as CourseSummary[];
      }
    } catch (error) {
      fastify.log.error({ err: error as Error }, 'Error fetching teacher courses');
    }
  } else {
    try {
      const response = await fetch(`${COURSE_SERVICE_URL}/all`, {
        headers: cookieHeader ? { 'Cookie': cookieHeader } : {}
      });
      if (response.ok) {
        courses = (await response.json()) as CourseSummary[];
      }
    } catch (error) {
      fastify.log.error({ err: error as Error }, 'Error fetching all courses');
    }
  }

  const courseIds = courses.map(c => c.id);

  if (courseIds.length === 0) {
    return { quizzes: [] };
  }

  const quizzes = await prisma.quiz.findMany({
    where: { courseId: { in: courseIds } },
    select: {
      id: true,
      title: true,
      description: true,
      courseId: true,
      status: true,
      quizType: true,
      maxAttempts: true,
      _count: { select: { questions: true, attempts: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  const quizzesWithCourse = quizzes.map(q => {
    const course = courses.find(c => c.id === q.courseId);
    return { ...q, courseTitle: course?.title || 'Corso sconosciuto' };
  });

  return { quizzes: quizzesWithCourse };
});

fastify.addHook('onClose', async () => {
  await prisma.$disconnect();
});

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3005;
    await fastify.listen({ port, host: '0.0.0.0' });
    fastify.log.info(`Quiz Service running on http://0.0.0.0:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

if (require.main === module) {
  start();
}

export { fastify, prisma };
