/*
  Warnings:

  - You are about to drop the `courses` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `users` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "content_service_schema"."contents" DROP CONSTRAINT "contents_course_id_fkey";

-- DropForeignKey
ALTER TABLE "content_service_schema"."courses" DROP CONSTRAINT "courses_teacher_id_fkey";

-- DropTable
DROP TABLE "content_service_schema"."courses";

-- DropTable
DROP TABLE "content_service_schema"."users";

-- DropEnum
DROP TYPE "content_service_schema"."ContentType";

-- DropEnum
DROP TYPE "content_service_schema"."Role";
