-- CreateEnum
CREATE TYPE "audit_service_schema"."AuditSeverity" AS ENUM ('INFO', 'WARNING', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "audit_service_schema"."audit_logs" (
    "id" SERIAL NOT NULL,
    "event_type" TEXT NOT NULL,
    "user_id" TEXT,
    "severity" "audit_service_schema"."AuditSeverity" NOT NULL DEFAULT 'INFO',
    "details" JSONB DEFAULT '{}',
    "source" TEXT DEFAULT 'SYSTEM',
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
