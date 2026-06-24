/*
  Warnings:

  - You are about to drop the `users` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
ALTER TYPE "course_service_schema"."EnrollmentStatus" ADD VALUE 'PENDING';

-- DropForeignKey
ALTER TABLE "course_service_schema"."courses" DROP CONSTRAINT "courses_teacher_id_fkey";

-- DropForeignKey
ALTER TABLE "course_service_schema"."enrollments" DROP CONSTRAINT "enrollments_student_id_fkey";

-- DropTable
DROP TABLE "course_service_schema"."users";

-- DropEnum
DROP TYPE "course_service_schema"."Role";
