import { PrismaService } from "../src/prisma/prisma.service";
import { SeedService } from "./seed.service";
import { BcryptProvider } from "../src/auth/providers/bcrypt.provider";

async function main() {
  const prisma = new PrismaService(); // manual init
  const hashingProvider = new BcryptProvider();
  const seeder = new SeedService(prisma, hashingProvider);

  await seeder.seed();

  await prisma.$disconnect();
}

main()
  .then(() => {
    console.log("🌱 Seeding completed.");
  })
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  });
