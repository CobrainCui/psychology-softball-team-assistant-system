-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('active', 'disabled');
CREATE TYPE "ActiveView" AS ENUM ('player', 'captain', 'coach');
CREATE TYPE "AccountRoleKind" AS ENUM ('player', 'captain', 'coach', 'admin');
CREATE TYPE "MembershipClaimStatus" AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE "EnrollmentCodeStatus" AS ENUM ('active', 'used', 'revoked');
CREATE TYPE "RoleChangeRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "status" "AccountStatus" NOT NULL DEFAULT 'active',
    "activeView" "ActiveView" NOT NULL DEFAULT 'player',
    "playerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountRole" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "role" "AccountRoleKind" NOT NULL,
    "grantedByAccountId" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MembershipClaim" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "status" "MembershipClaimStatus" NOT NULL DEFAULT 'pending',
    "displayName" TEXT NOT NULL,
    "playerId" TEXT,
    "reviewedByAccountId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipClaim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnrollmentCode" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "status" "EnrollmentCodeStatus" NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "usedByAccountId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedNote" TEXT,
    "createdByAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrollmentCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoleChangeRequest" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "requestedRole" "AccountRoleKind" NOT NULL,
    "status" "RoleChangeRequestStatus" NOT NULL DEFAULT 'pending',
    "reviewedByAccountId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleChangeRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthAuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorAccountId" TEXT,
    "targetAccountId" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthRateLimit" (
    "bucket" TEXT NOT NULL,
    "count" INT NOT NULL DEFAULT 0,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthRateLimit_pkey" PRIMARY KEY ("bucket")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_username_key" ON "Account"("username");
CREATE UNIQUE INDEX "Account_playerId_key" ON "Account"("playerId");
CREATE INDEX "Account_teamId_idx" ON "Account"("teamId");

CREATE UNIQUE INDEX "AccountRole_accountId_role_key" ON "AccountRole"("accountId", "role");
CREATE INDEX "AccountRole_accountId_idx" ON "AccountRole"("accountId");

CREATE UNIQUE INDEX "MembershipClaim_accountId_key" ON "MembershipClaim"("accountId");
CREATE INDEX "MembershipClaim_status_idx" ON "MembershipClaim"("status");

CREATE UNIQUE INDEX "EnrollmentCode_codeHash_key" ON "EnrollmentCode"("codeHash");
CREATE INDEX "EnrollmentCode_teamId_status_idx" ON "EnrollmentCode"("teamId", "status");

CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");
CREATE INDEX "AuthSession_accountId_idx" ON "AuthSession"("accountId");
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_accountId_idx" ON "PasswordResetToken"("accountId");

CREATE INDEX "RoleChangeRequest_accountId_status_idx" ON "RoleChangeRequest"("accountId", "status");

CREATE INDEX "AuthAuditLog_createdAt_idx" ON "AuthAuditLog"("createdAt");
CREATE INDEX "AuthAuditLog_action_idx" ON "AuthAuditLog"("action");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Account" ADD CONSTRAINT "Account_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AccountRole" ADD CONSTRAINT "AccountRole_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MembershipClaim" ADD CONSTRAINT "MembershipClaim_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MembershipClaim" ADD CONSTRAINT "MembershipClaim_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MembershipClaim" ADD CONSTRAINT "MembershipClaim_reviewedByAccountId_fkey" FOREIGN KEY ("reviewedByAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EnrollmentCode" ADD CONSTRAINT "EnrollmentCode_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnrollmentCode" ADD CONSTRAINT "EnrollmentCode_createdByAccountId_fkey" FOREIGN KEY ("createdByAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EnrollmentCode" ADD CONSTRAINT "EnrollmentCode_usedByAccountId_fkey" FOREIGN KEY ("usedByAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RoleChangeRequest" ADD CONSTRAINT "RoleChangeRequest_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoleChangeRequest" ADD CONSTRAINT "RoleChangeRequest_reviewedByAccountId_fkey" FOREIGN KEY ("reviewedByAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AuthAuditLog" ADD CONSTRAINT "AuthAuditLog_actorAccountId_fkey" FOREIGN KEY ("actorAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
