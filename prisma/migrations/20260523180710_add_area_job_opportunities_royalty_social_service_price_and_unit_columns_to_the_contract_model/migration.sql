-- CreateEnum
CREATE TYPE "Unit" AS ENUM ('Kilometre', 'Metre', 'Hectares');

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "area" INTEGER,
ADD COLUMN     "jobـopportunities" INTEGER,
ADD COLUMN     "royalty" INTEGER,
ADD COLUMN     "social_service_price" INTEGER,
ADD COLUMN     "unit" "Unit" DEFAULT 'Kilometre';
