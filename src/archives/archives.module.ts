import { Module } from "@nestjs/common";
import { ArchivesController } from "./archives.controller";
import { ArchivesService } from "./archives.service";
import { PrismaModule } from "src/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [ArchivesController],
  providers: [ArchivesService],
})
export class ArchivesModule {}
