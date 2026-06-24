const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const authPrisma = new PrismaClient();

const TEACHER_UUIDS = {
  teacher1: '49e5313e-37e4-4963-bfb2-8433d6927f1e',
  teacher2: '85a27e45-d1f1-4cee-ae69-76746b5b3224',
  teacher3: 'fc3f827d-374c-4312-8469-4e4c926a7844',
};

const STUDENT_UUIDS = {
  student1: '66311fd4-800d-409e-8f6b-8be673abc9d4',
  student2: '353772d7-ad7c-42db-80f9-fa58ab057788',
  student3: '089f3637-903a-484f-93fc-244ce0950433',
  student4: 'feb406c4-a0fb-4b37-8e85-1711355d32a7',
  student5: '47e69dc0-c162-49a4-bcfd-377bbf41b092',
};

const ADMIN_UUIDS = {
  admin: 'a1000000-0000-4000-8000-000000000001',
  superadmin: 'a1000000-0000-4000-8000-000000000002',
};

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
      { id: ADMIN_UUIDS.admin, email: 'admin@elearning.local', passwordHash: adminHash, role: 'ADMIN', firstName: 'Admin', lastName: 'Main', isVerified: true, preferences: { receiveEmails: true } },
      { id: ADMIN_UUIDS.superadmin, email: 'superadmin@test.com', passwordHash: adminHash, role: 'ADMIN', firstName: 'Super', lastName: 'Admin', isVerified: true, preferences: { receiveEmails: true } },
      { id: TEACHER_UUIDS.teacher1, email: 'teacher1@test.com', passwordHash: teacherHash, role: 'TEACHER', firstName: 'Mario', lastName: 'Rossi', isVerified: true, preferences: { receiveEmails: true } },
      { id: TEACHER_UUIDS.teacher2, email: 'teacher2@test.com', passwordHash: teacherHash, role: 'TEACHER', firstName: 'Luigi', lastName: 'Bianchi', isVerified: true, preferences: { receiveEmails: true } },
      { id: TEACHER_UUIDS.teacher3, email: 'teacher3@test.com', passwordHash: teacherHash, role: 'TEACHER', firstName: 'Giulia', lastName: 'Verdi', isVerified: true, preferences: { receiveEmails: true } },
      { id: STUDENT_UUIDS.student1, email: 'student1@test.com', passwordHash: studentHash, role: 'STUDENT', firstName: 'Francesco', lastName: 'Neri', isVerified: true, preferences: { receiveEmails: true } },
      { id: STUDENT_UUIDS.student2, email: 'student2@test.com', passwordHash: studentHash, role: 'STUDENT', firstName: 'Sofia', lastName: 'Gialli', isVerified: true, preferences: { receiveEmails: true } },
      { id: STUDENT_UUIDS.student3, email: 'student3@test.com', passwordHash: studentHash, role: 'STUDENT', firstName: 'Alessandro', lastName: 'Blu', isVerified: true, preferences: { receiveEmails: true } },
      { id: STUDENT_UUIDS.student4, email: 'student4@test.com', passwordHash: studentHash, role: 'STUDENT', firstName: 'Emma', lastName: 'Rosa', isVerified: true, preferences: { receiveEmails: true } },
      { id: STUDENT_UUIDS.student5, email: 'student5@test.com', passwordHash: studentHash, role: 'STUDENT', firstName: 'Lorenzo', lastName: 'Arancioni', isVerified: true, preferences: { receiveEmails: true } },
    ],
  });

  console.log('Created 10 users (2 admins, 3 teachers, 5 students)');
  await authPrisma.$disconnect();
}

seedAuth().then(() => console.log('Done')).catch(e => { console.error(e); process.exit(1); });
