-- CreateEnum
CREATE TYPE "content_service_schema"."Role" AS ENUM ('ADMIN', 'TEACHER', 'STUDENT');

-- CreateEnum
CREATE TYPE "content_service_schema"."ContentType" AS ENUM ('VIDEO', 'DOCUMENT');

-- CreateTable
CREATE TABLE "content_service_schema"."users" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'STUDENT',
    "first_name" TEXT,
    "last_name" TEXT,
    "preferences" JSONB DEFAULT '{}',
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_service_schema"."courses" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "description" TEXT,
    "teacher_id" TEXT NOT NULL,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "enrollment_type" TEXT NOT NULL DEFAULT 'FREE',
    "enrollment_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_service_schema"."contents" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "course_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "file_path" TEXT,
    "mime_type" TEXT,
    "size" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "content_service_schema"."users"("email");

-- AddForeignKey
ALTER TABLE "content_service_schema"."courses" ADD CONSTRAINT "courses_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "content_service_schema"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_service_schema"."contents" ADD CONSTRAINT "contents_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "content_service_schema"."courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
