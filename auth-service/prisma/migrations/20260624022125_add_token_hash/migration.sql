-- Migration: add_token_hash
-- Replaces plaintext `token` column with sha256 `token_hash`
-- All existing sessions are invalidated since plaintext tokens are replaced with their own hash

-- Add user_id column
ALTER TABLE "auth_service_schema"."revoked_tokens"
ADD COLUMN "user_id" TEXT;

-- Add token_hash column (nullable initially)
ALTER TABLE "auth_service_schema"."revoked_tokens"
ADD COLUMN "token_hash" TEXT;

-- Hash existing tokens in-place: sha256(token) to maintain replay protection
-- If a token was already in the DB, reusing it will now fail because 
-- sha256(token) will match the existing hash
UPDATE "auth_service_schema"."revoked_tokens"
SET "token_hash" = encode(sha256("token"::bytea), 'hex');

-- Drop old token column and its unique index
ALTER TABLE "auth_service_schema"."revoked_tokens"
DROP CONSTRAINT IF EXISTS "revoked_tokens_token_key";

ALTER TABLE "auth_service_schema"."revoked_tokens"
DROP COLUMN "token";

-- Make token_hash NOT NULL and add unique constraint
ALTER TABLE "auth_service_schema"."revoked_tokens"
ALTER COLUMN "token_hash" SET NOT NULL;

CREATE UNIQUE INDEX "revoked_tokens_token_hash_key"
ON "auth_service_schema"."revoked_tokens"("token_hash");
