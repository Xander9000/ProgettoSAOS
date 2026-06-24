-- Migration: add_pending_login
-- Adds PendingLogin model for 2FA challenge flow

CREATE TABLE "auth_service_schema"."pending_logins" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_logins_pkey" PRIMARY KEY ("id")
);
