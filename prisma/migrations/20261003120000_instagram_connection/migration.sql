-- Conexão com o Instagram para publicação automática (token cifrado).
CREATE TABLE "InstagramConnection" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "tokenCipher" TEXT NOT NULL DEFAULT '',
    "tokenHint" TEXT NOT NULL DEFAULT '',
    "igUserId" TEXT NOT NULL DEFAULT '',
    "username" TEXT NOT NULL DEFAULT '',
    "tokenExpiresAt" DATETIME,
    "lastCheckedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);
