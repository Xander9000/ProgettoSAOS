-- AlterTable: remove unused password_hash column from users table
ALTER TABLE "quiz_service_schema"."users" DROP COLUMN IF EXISTS "password_hash";
