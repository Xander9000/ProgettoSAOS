import { PrismaClient } from '../auth-service/node_modules/@prisma/client';
import { PrismaClient as CoursePrismaClient } from '../course-service/node_modules/@prisma/client';
import { PrismaClient as ContentPrismaClient } from '../content-service/node_modules/@prisma/client';
import { PrismaClient as QuizPrismaClient } from '../quiz-service/node_modules/@prisma/client';
import { PrismaClient as NotificationPrismaClient } from '../notification-service/node_modules/@prisma/client';
import { PrismaClient as AuditPrismaClient } from '../audit-service/node_modules/@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const CONFIGS = {
  auth: 'postgresql://root:rootpassword@localhost:5432/postgres?schema=auth_service_schema',
  course: 'postgresql://root:rootpassword@localhost:5432/postgres?schema=course_service_schema',
  content: 'postgresql://root:rootpassword@localhost:5432/postgres?schema=content_service_schema',
  quiz: 'postgresql://root:rootpassword@localhost:5432/postgres?schema=quiz_service_schema',
  notification: 'postgresql://root:rootpassword@localhost:5432/postgres?schema=notification_service_schema',
  audit: 'postgresql://root:rootpassword@localhost:5432/postgres?schema=audit_service_schema',
};

const authPrisma = new PrismaClient({ datasources: { db: { url: CONFIGS.auth } } }) as any;
const coursePrisma = new CoursePrismaClient({ datasources: { db: { url: CONFIGS.course } } }) as any;
const contentPrisma = new ContentPrismaClient({ datasources: { db: { url: CONFIGS.content } } }) as any;
const quizPrisma = new QuizPrismaClient({ datasources: { db: { url: CONFIGS.quiz } } }) as any;
const notificationPrisma = new NotificationPrismaClient({ datasources: { db: { url: CONFIGS.notification } } }) as any;
const auditPrisma = new AuditPrismaClient({ datasources: { db: { url: CONFIGS.audit } } }) as any;

async function seedAuth() {
  console.log('Seeding auth_service_schema...');

  await authPrisma.session.deleteMany({});
  await authPrisma.revokedToken.deleteMany({});
  await authPrisma.user.deleteMany({});

  const adminHash = await bcrypt.hash('admin123', 10);
  const teacherHash = await bcrypt.hash('teacher123', 10);
  const studentHash = await bcrypt.hash('student123', 10);

  await authPrisma.user.createMany({
    data: [
      { email: 'admin@elearning.local', passwordHash: adminHash, role: 'ADMIN', firstName: 'Admin', lastName: 'Main', preferences: { receiveEmails: true } },
      { email: 'superadmin@test.com', passwordHash: adminHash, role: 'ADMIN', firstName: 'Super', lastName: 'Admin', preferences: { receiveEmails: true } },
      { email: 'teacher1@test.com', passwordHash: teacherHash, role: 'TEACHER', firstName: 'Mario', lastName: 'Rossi', preferences: { receiveEmails: true } },
      { email: 'teacher2@test.com', passwordHash: teacherHash, role: 'TEACHER', firstName: 'Luigi', lastName: 'Bianchi', preferences: { receiveEmails: true } },
      { email: 'teacher3@test.com', passwordHash: teacherHash, role: 'TEACHER', firstName: 'Giulia', lastName: 'Verdi', preferences: { receiveEmails: true } },
      { email: 'student1@test.com', passwordHash: studentHash, role: 'STUDENT', firstName: 'Francesco', lastName: 'Neri', preferences: { receiveEmails: true } },
      { email: 'student2@test.com', passwordHash: studentHash, role: 'STUDENT', firstName: 'Sofia', lastName: 'Gialli', preferences: { receiveEmails: true } },
      { email: 'student3@test.com', passwordHash: studentHash, role: 'STUDENT', firstName: 'Alessandro', lastName: 'Blu', preferences: { receiveEmails: true } },
      { email: 'student4@test.com', passwordHash: studentHash, role: 'STUDENT', firstName: 'Emma', lastName: 'Rosa', preferences: { receiveEmails: true } },
      { email: 'student5@test.com', passwordHash: studentHash, role: 'STUDENT', firstName: 'Lorenzo', lastName: 'Arancioni', preferences: { receiveEmails: true } },
    ],
  });

  console.log('Created 10 users (2 admins, 3 teachers, 5 students)');
}

async function seedCourse() {
  console.log('\nSeeding course_service_schema...');

  await coursePrisma.enrollment.deleteMany({});
  await coursePrisma.teacherMessage.deleteMany({});
  await coursePrisma.course.deleteMany({});

  const teachers = await authPrisma.user.findMany({ where: { role: 'TEACHER' } });
  const teacherIds = teachers.map((t: any) => t.id);

  const hashKey = (key: string) => crypto.createHash('sha256').update(key).digest('hex');

  await coursePrisma.course.createMany({
    data: [
      { title: 'Fondamenti di Microservizi', description: 'Corso introduttivo sui microservizi', teacherId: teacherIds[0], isPublished: true, enrollmentType: 'FREE' },
      { title: 'Architettura Cloud Native', description: 'Architetture moderne per il cloud', teacherId: teacherIds[0], isPublished: true, enrollmentType: 'KEY', enrollmentKey: hashKey('cloud2024') },
      { title: 'Sicurezza API e WAF', description: 'Security per applicazioni web', teacherId: teacherIds[1], isPublished: true, enrollmentType: 'FREE' },
      { title: 'DevOps Avanzato', description: 'CI/CD e infrastruttura come codice', teacherId: teacherIds[1], isPublished: false, enrollmentType: 'APPROVAL' },
      { title: 'Introduzione al Machine Learning', description: 'Primi passi nel ML', teacherId: teacherIds[2], isPublished: true, enrollmentType: 'FREE' },
      { title: 'Data Engineering con Python', description: 'Gestione dati su larga scala', teacherId: teacherIds[2], isPublished: true, enrollmentType: 'KEY', enrollmentKey: hashKey('dataeng') },
    ],
  });
  console.log('Created 6 courses');

  const allCourses = await coursePrisma.course.findMany({ select: { id: true } });
  const students = await authPrisma.user.findMany({ where: { role: 'STUDENT' } });
  const studentIds = students.map((s: any) => s.id);

  await coursePrisma.enrollment.createMany({
    data: [
      { courseId: allCourses[0].id, studentId: studentIds[0], status: 'ACTIVE' },
      { courseId: allCourses[0].id, studentId: studentIds[1], status: 'ACTIVE' },
      { courseId: allCourses[2].id, studentId: studentIds[0], status: 'ACTIVE' },
      { courseId: allCourses[2].id, studentId: studentIds[2], status: 'ACTIVE' },
      { courseId: allCourses[4].id, studentId: studentIds[1], status: 'ACTIVE' },
      { courseId: allCourses[4].id, studentId: studentIds[3], status: 'ACTIVE' },
      { courseId: allCourses[4].id, studentId: studentIds[4], status: 'ACTIVE' },
    ],
  });
  console.log('Created 7 enrollments');

  await coursePrisma.teacherMessage.createMany({
    data: [
      { courseId: allCourses[0].id, content: 'Benvenuti al corso di Microservizi! Inizieremo con i fondamenti.' },
      { courseId: allCourses[4].id, content: 'Prima lezione di Machine Learning - preparate il vostro ambiente!' },
    ],
  });
  console.log('Created 2 teacher messages');
}

async function seedQuiz() {
  console.log('\nSeeding quiz_service_schema...');

  await quizPrisma.attempt.deleteMany({});
  await quizPrisma.answer.deleteMany({});
  await quizPrisma.question.deleteMany({});
  await quizPrisma.quiz.deleteMany({});

  const courses = await coursePrisma.course.findMany({ select: { id: true }, take: 1 });
  const courseId = courses[0]?.id || '00000000-0000-0000-0000-000000000000';

  const q1 = await quizPrisma.question.create({
    data: {
      quiz: {
        create: {
          courseId: courseId,
          title: 'Quiz Introduttivo - Microservizi',
          description: 'Verifica la comprensione dei concetti base',
          quizType: 'CUSTOM',
          status: 'PUBLISHED',
        },
      },
      text: 'Cosa sono i microservizi?',
      order: 0,
      answers: {
        create: [
          { text: 'Un tipo di database', isCorrect: false, order: 0 },
          { text: 'Un approccio architetturale che struttura un applicazione come insieme di servizi', isCorrect: true, order: 1 },
          { text: 'Un framework JavaScript', isCorrect: false, order: 2 },
          { text: 'Un sistema operativo', isCorrect: false, order: 3 },
        ],
      },
    },
  });

  await quizPrisma.question.create({
    data: {
      quizId: q1.quizId,
      text: 'Quale protocollo usano comunemente i microservizi per comunicare?',
      order: 1,
      answers: {
        create: [
          { text: 'HTTP/REST o gRPC', isCorrect: true, order: 0 },
          { text: 'FTP', isCorrect: false, order: 1 },
          { text: 'SMTP', isCorrect: false, order: 2 },
          { text: 'SSH', isCorrect: false, order: 3 },
        ],
      },
    },
  });

  await quizPrisma.question.create({
    data: {
      quiz: {
        create: {
          courseId: courseId,
          title: 'Quiz Cloud Native',
          description: 'Test sulle architetture cloud-native',
          status: 'DRAFT',
        },
      },
      text: 'Cosa significa "12-factor app"?',
      order: 0,
      answers: {
        create: [
          { text: 'Un requisito hardware', isCorrect: false, order: 0 },
          { text: 'Una metodologia per build di applicazioni SaaS moderni', isCorrect: true, order: 1 },
          { text: 'Un linguaggio di programmazione', isCorrect: false, order: 2 },
          { text: 'Un database NoSQL', isCorrect: false, order: 3 },
        ],
      },
    },
  });

  console.log('Created 2 quizzes with questions and answers');

  const students = await authPrisma.user.findMany({ where: { role: 'STUDENT' }, select: { id: true } });
  const quizzes = await quizPrisma.quiz.findMany({ select: { id: true }, take: 1 });

  if (quizzes[0] && students[0]) {
    await quizPrisma.attempt.createMany({
      data: [
        { studentId: students[0].id, quizId: quizzes[0].id, score: 80, maxScore: 100, completedAt: new Date() },
        { studentId: students[1]?.id || students[0].id, quizId: quizzes[0].id, score: 60, maxScore: 100, completedAt: new Date() },
      ],
    });
    console.log('Created 2 attempts');
  }
}

async function seedContent() {
  console.log('\nSeeding content_service_schema...');

  await contentPrisma.content.deleteMany({});

  const courses = await coursePrisma.course.findMany({ select: { id: true } });

  await contentPrisma.content.createMany({
    data: [
      { courseId: courses[0].id, type: 'VIDEO', title: 'Lezione 1: Introduzione ai Microservizi', filePath: 'vid_001.mp4', mimeType: 'video/mp4', size: '250MB', isPublic: true },
      { courseId: courses[0].id, type: 'DOCUMENT', title: 'Slide Corso Microservizi', filePath: 'pdf_001.pdf', mimeType: 'application/pdf', size: '5MB', isPublic: true },
      { courseId: courses[2].id, type: 'VIDEO', title: 'Lezione 1: Sicurezza API Gateway', filePath: 'vid_002.mp4', mimeType: 'video/mp4', size: '180MB', isPublic: false },
      { courseId: courses[4].id, type: 'DOCUMENT', title: 'Introduzione al ML', filePath: 'pdf_002.pdf', mimeType: 'application/pdf', size: '3MB', isPublic: true },
    ],
  });

  console.log('Created 4 contents');
}

async function seedNotifications() {
  console.log('\nSeeding notification_service_schema...');

  await notificationPrisma.notification.deleteMany({});

  const students = await authPrisma.user.findMany({ where: { role: 'STUDENT' }, select: { id: true } });
  const courses = await coursePrisma.course.findMany({ select: { id: true } });

  await notificationPrisma.notification.createMany({
    data: [
      { userId: students[0].id, type: 'ENROLLMENT', title: 'Iscrizione completata', message: 'Ti sei iscritto con successo a "Fondamenti di Microservizi"', courseId: courses[0].id },
      { userId: students[0].id, type: 'ENROLLMENT', title: 'Iscrizione completata', message: 'Ti sei iscritto con successo a "Sicurezza API e WAF"', courseId: courses[2].id },
      { userId: students[1]?.id || students[0].id, type: 'ENROLLMENT', title: 'Iscrizione completata', message: 'Ti sei iscritto con successo a "Introduzione al Machine Learning"', courseId: courses[4].id },
      { userId: students[2]?.id || students[0].id, type: 'ENROLLMENT', title: 'Iscrizione completata', message: 'Ti sei iscritto con successo a "Sicurezza API e WAF"', courseId: courses[2].id },
    ],
  });

  console.log('Created 4 notifications');
}

async function seedAudit() {
  console.log('\nSeeding audit_service_schema...');

  await auditPrisma.auditLog.deleteMany({});

  const users = await authPrisma.user.findMany({ select: { id: true } });

  await auditPrisma.auditLog.createMany({
    data: [
      { eventType: 'USER_LOGIN', userId: users[0].id, severity: 'INFO', details: { ip: '192.168.1.1' }, source: 'auth-service' },
      { eventType: 'COURSE_CREATED', userId: users[3]?.id || users[0].id, severity: 'INFO', details: { courseTitle: 'Nuovo Corso' }, source: 'course-service' },
      { eventType: 'ENROLLMENT', userId: users[0].id, severity: 'INFO', details: { courseId: 'course-1' }, source: 'course-service' },
    ],
  });

  console.log('Created 3 audit logs');
}

async function main() {
  console.log('=== E-Learning Platform: Demo Data Seeding ===\n');

  try {
    await seedAuth();
    await seedCourse();
    await seedQuiz();
    await seedContent();
    await seedNotifications();
    await seedAudit();

    console.log('\n=== Seeding Complete ===');
    console.log('\nTest Credentials:');
    console.log('  Admin:    admin@elearning.local / admin123');
    console.log('  Teacher:  teacher1@test.com / teacher123');
    console.log('  Student:  student1@test.com / student123');
  } catch (error) {
    console.error('Error during seeding:', error);
    throw error;
  } finally {
    await (authPrisma as any).$disconnect();
    await (coursePrisma as any).$disconnect();
    await (contentPrisma as any).$disconnect();
    await (quizPrisma as any).$disconnect();
    await (notificationPrisma as any).$disconnect();
    await (auditPrisma as any).$disconnect();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
