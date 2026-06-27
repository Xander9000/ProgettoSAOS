const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const coursePrisma = new PrismaClient();

function hashEnrollmentKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

const TEACHER_IDS = [
  '49e5313e-37e4-4963-bfb2-8433d6927f1e',
  '85a27e45-d1f1-4cee-ae69-76746b5b3224',
  'fc3f827d-374c-4312-8469-4e4c926a7844'
];

const STUDENT_IDS = [
  '66311fd4-800d-409e-8f6b-8be673abc9d4',
  '353772d7-ad7c-42db-80f9-fa58ab057788',
  '089f3637-903a-484f-93fc-244ce0950433',
  'feb406c4-a0fb-4b37-8e85-1711355d32a7',
  '47e69dc0-c162-49a4-bcfd-377bbf41b092'
];

const COURSE_UUIDS = {
  microservizi: 'a460315e-7e0b-4566-9e2e-0290e864e104',
  cloudNative: '4c269623-c65d-4aa5-aad2-417314c63458',
  sicurezza: '4a710f7f-1dc4-4784-85f8-af749b772eef',
  machineLearning: 'a6b7c8d9-e0f1-2345-6789-abcdef012345',
};

async function seedCourse() {
  console.log('Seeding course_service_schema...');

  await coursePrisma.enrollment.deleteMany({});
  await coursePrisma.teacherMessage.deleteMany({});
  await coursePrisma.course.deleteMany({});

  await coursePrisma.course.createMany({
    data: [
      { id: COURSE_UUIDS.microservizi, title: 'Fondamenti di Microservizi', description: 'Corso introduttivo sui microservizi', teacherId: TEACHER_IDS[0], isPublished: true, enrollmentType: 'FREE' },
      { id: COURSE_UUIDS.cloudNative, title: 'Architettura Cloud Native', description: 'Architetture moderne per il cloud', teacherId: TEACHER_IDS[0], isPublished: true, enrollmentType: 'KEY', enrollmentKey: hashEnrollmentKey('cloud2024') },
      { id: COURSE_UUIDS.sicurezza, title: 'Sicurezza API e WAF', description: 'Security per applicazioni web', teacherId: TEACHER_IDS[1], isPublished: true, enrollmentType: 'FREE' },
      { title: 'DevOps Avanzato', description: 'CI/CD e infrastruttura come codice', teacherId: TEACHER_IDS[1], isPublished: false, enrollmentType: 'APPROVAL' },
      { id: COURSE_UUIDS.machineLearning, title: 'Introduzione al Machine Learning', description: 'Primi passi nel ML', teacherId: TEACHER_IDS[2], isPublished: true, enrollmentType: 'FREE' },
      { title: 'Data Engineering con Python', description: 'Gestione dati su larga scala', teacherId: TEACHER_IDS[2], isPublished: true, enrollmentType: 'KEY', enrollmentKey: hashEnrollmentKey('dataeng') },
    ],
  });
  console.log('Created 6 courses');

  await coursePrisma.enrollment.createMany({
    data: [
      { courseId: COURSE_UUIDS.microservizi, studentId: STUDENT_IDS[0], status: 'ACTIVE' },
      { courseId: COURSE_UUIDS.microservizi, studentId: STUDENT_IDS[1], status: 'ACTIVE' },
      { courseId: COURSE_UUIDS.sicurezza, studentId: STUDENT_IDS[0], status: 'ACTIVE' },
      { courseId: COURSE_UUIDS.sicurezza, studentId: STUDENT_IDS[2], status: 'ACTIVE' },
      { courseId: COURSE_UUIDS.machineLearning, studentId: STUDENT_IDS[1], status: 'ACTIVE' },
      { courseId: COURSE_UUIDS.machineLearning, studentId: STUDENT_IDS[3], status: 'ACTIVE' },
      { courseId: COURSE_UUIDS.machineLearning, studentId: STUDENT_IDS[4], status: 'ACTIVE' },
    ],
  });
  console.log('Created 7 enrollments');

  await coursePrisma.teacherMessage.createMany({
    data: [
      { courseId: COURSE_UUIDS.microservizi, content: 'Benvenuti al corso di Microservizi! Inizieremo con i fondamenti.' },
      { courseId: COURSE_UUIDS.machineLearning, content: 'Prima lezione di Machine Learning - preparate il vostro ambiente!' },
    ],
  });
  console.log('Created 2 teacher messages');

  await coursePrisma.$disconnect();
  console.log('\nCourse seeding complete!');
}

seedCourse().catch(e => { console.error(e); process.exit(1); });
