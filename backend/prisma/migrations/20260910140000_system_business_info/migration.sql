-- Business letterhead fields on SystemPreference (singleton id=1).
ALTER TABLE "SystemPreference" ADD COLUMN "businessName" TEXT NOT NULL DEFAULT 'Sufi & Co.';
ALTER TABLE "SystemPreference" ADD COLUMN "proprietorName" TEXT NOT NULL DEFAULT 'Sufi M.Saleem Ullah';
ALTER TABLE "SystemPreference" ADD COLUMN "phone" TEXT NOT NULL DEFAULT '0632501213';
ALTER TABLE "SystemPreference" ADD COLUMN "mobile" TEXT;
ALTER TABLE "SystemPreference" ADD COLUMN "email" TEXT;
ALTER TABLE "SystemPreference" ADD COLUMN "ntnNumber" TEXT;

UPDATE "SystemPreference"
SET
  "mobile" = '03006982486',
  "email" = 'sufisaleemullah@gmail.com'
WHERE "id" = 1;
