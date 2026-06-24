const { PrismaClient } = require('@prisma/client');

const quizPrisma = new PrismaClient();

const STUDENT_IDS = [
  '66311fd4-800d-409e-8f6b-8be673abc9d4',
  '353772d7-ad7c-42db-80f9-fa58ab057788'
];

const COURSE_ID = 'a460315e-7e0b-4566-9e2e-0290e864e104';

async function seedQuiz() {
  console.log('Seeding quiz_service_schema...');

  await quizPrisma.attempt.deleteMany({});
  await quizPrisma.answer.deleteMany({});
  await quizPrisma.question.deleteMany({});
  await quizPrisma.quiz.deleteMany({});

  const q1 = await quizPrisma.question.create({
    data: {
      quiz: {
        create: {
          courseId: COURSE_ID,
          title: 'Quiz Introduttivo - Microservizi',
          description: 'Verifica la comprensione dei concetti base',
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
          courseId: COURSE_ID,
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

  const quizzes = await quizPrisma.quiz.findMany({ select: { id: true }, take: 1 });

  if (quizzes[0] && STUDENT_IDS[0]) {
    await quizPrisma.attempt.createMany({
      data: [
        { studentId: STUDENT_IDS[0], quizId: quizzes[0].id, score: 80, maxScore: 100, completedAt: new Date() },
        { studentId: STUDENT_IDS[1], quizId: quizzes[0].id, score: 60, maxScore: 100, completedAt: new Date() },
      ],
    });
    console.log('Created 2 attempts');
  }

  await quizPrisma.$disconnect();
  console.log('\nQuiz seeding complete!');
}

seedQuiz().catch(e => { console.error(e); process.exit(1); });
