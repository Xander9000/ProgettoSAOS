const { PrismaClient } = require('@prisma/client');

const quizPrisma = new PrismaClient();

const STUDENT_IDS = [
  '66311fd4-800d-409e-8f6b-8be673abc9d4',
  '353772d7-ad7c-42db-80f9-fa58ab057788'
];

const COURSE_ID = 'a460315e-7e0b-4566-9e2e-0290e864e104';

async function seedQuiz() {
  console.log('Seeding quiz_service_schema...');

  await quizPrisma.questionSubmission.deleteMany({});
  await quizPrisma.attempt.deleteMany({});
  await quizPrisma.answer.deleteMany({});
  await quizPrisma.question.deleteMany({});
  await quizPrisma.quiz.deleteMany({});

  // === Quiz 1: MULTIPLE_CHOICE (PUBLISHED) ===
  const quiz1 = await quizPrisma.quiz.create({
    data: {
      courseId: COURSE_ID,
      title: 'Quiz Introduttivo - Microservizi',
      description: 'Verifica la comprensione dei concetti base',
      status: 'PUBLISHED',
      passingScore: 50,
    },
  });

  const q1q1 = await quizPrisma.question.create({
    data: {
      quizId: quiz1.id,
      text: 'Cosa sono i microservizi?',
      questionType: 'MULTIPLE_CHOICE',
      points: 1,
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
    include: { answers: true },
  });

  const q1q2 = await quizPrisma.question.create({
    data: {
      quizId: quiz1.id,
      text: 'Quale protocollo usano comunemente i microservizi per comunicare?',
      questionType: 'MULTIPLE_CHOICE',
      points: 1,
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
    include: { answers: true },
  });

  // === Quiz 2: OPEN_ANSWER (PUBLISHED) ===
  const quiz2 = await quizPrisma.quiz.create({
    data: {
      courseId: COURSE_ID,
      title: 'Architettura Cloud Native',
      description: 'Domanda aperta sui 12-factor app',
      status: 'PUBLISHED',
      passingScore: 60,
    },
  });

  const q2q1 = await quizPrisma.question.create({
    data: {
      quizId: quiz2.id,
      text: 'Spiega cosa significa "12-factor app" e perché è importante nelle architetture cloud-native.',
      questionType: 'OPEN_ANSWER',
      points: 10,
      order: 0,
    },
  });

  console.log('Created 2 quizzes with questions');

  // === Attempts for Quiz 1 (MULTIPLE_CHOICE) ===
  const maxScoreQuiz1 = 2;

  // STUDENT_IDS[0]: both correct
  const attempt1 = await quizPrisma.attempt.create({
    data: {
      studentId: STUDENT_IDS[0],
      quizId: quiz1.id,
      score: 2,
      maxScore: maxScoreQuiz1,
      percentage: 100,
      passed: true,
      completedAt: new Date(),
      gradedAt: new Date(),
    },
  });

  await quizPrisma.questionSubmission.createMany({
    data: [
      {
        attemptId: attempt1.id,
        questionId: q1q1.id,
        answerId: q1q1.answers.find(a => a.isCorrect).id,
        points: 1,
        gradingStatus: 'ACCEPTED',
      },
      {
        attemptId: attempt1.id,
        questionId: q1q2.id,
        answerId: q1q2.answers.find(a => a.isCorrect).id,
        points: 1,
        gradingStatus: 'ACCEPTED',
      },
    ],
  });

  // STUDENT_IDS[1]: one correct, one wrong
  const attempt2 = await quizPrisma.attempt.create({
    data: {
      studentId: STUDENT_IDS[1],
      quizId: quiz1.id,
      score: 1,
      maxScore: maxScoreQuiz1,
      percentage: 50,
      passed: false,
      completedAt: new Date(),
      gradedAt: new Date(),
    },
  });

  await quizPrisma.questionSubmission.createMany({
    data: [
      {
        attemptId: attempt2.id,
        questionId: q1q1.id,
        answerId: q1q1.answers.find(a => a.isCorrect).id,
        points: 1,
        gradingStatus: 'ACCEPTED',
      },
      {
        attemptId: attempt2.id,
        questionId: q1q2.id,
        answerId: q1q2.answers.find(a => !a.isCorrect).id,
        points: 0,
        gradingStatus: 'REJECTED',
      },
    ],
  });

  console.log('Created 2 attempts for Quiz 1 (multiple choice)');

  // === Attempt for Quiz 2 (OPEN_ANSWER - needs grading) ===
  const attempt3 = await quizPrisma.attempt.create({
    data: {
      studentId: STUDENT_IDS[0],
      quizId: quiz2.id,
      score: 0,
      maxScore: 10,
      percentage: 0,
      passed: null,
      completedAt: new Date(),
    },
  });

  await quizPrisma.questionSubmission.create({
    data: {
      attemptId: attempt3.id,
      questionId: q2q1.id,
      textAnswer: 'Secondo me, 12-factor app è una metodologia per creare applicazioni cloud-native seguendo 12 principi come il versionamento del codice, la configurazione esterna, i log come flussi di eventi, etc.',
      points: 0,
      gradingStatus: 'PENDING',
    },
  });

  console.log('Created 1 attempt for Quiz 2 (open answer - needs grading)');

  await quizPrisma.$disconnect();
  console.log('\nQuiz seeding complete!');
}

seedQuiz().catch(e => { console.error(e); process.exit(1); });
