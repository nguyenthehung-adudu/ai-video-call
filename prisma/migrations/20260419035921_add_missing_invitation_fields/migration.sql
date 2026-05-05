-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Invitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "meetingId" TEXT NOT NULL,
    "meetingName" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "hostName" TEXT NOT NULL,
    "inviteeEmail" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'scheduled',
    "scheduledAt" DATETIME,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Invitation" ("createdAt", "hostId", "hostName", "id", "inviteeEmail", "meetingId", "meetingName") SELECT "createdAt", "hostId", "hostName", "id", "inviteeEmail", "meetingId", "meetingName" FROM "Invitation";
DROP TABLE "Invitation";
ALTER TABLE "new_Invitation" RENAME TO "Invitation";
CREATE INDEX "Invitation_inviteeEmail_idx" ON "Invitation"("inviteeEmail");
CREATE INDEX "Invitation_isRead_idx" ON "Invitation"("isRead");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
