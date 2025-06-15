import { Controller, Get } from "@nestjs/common";
import { ArchivesService } from "./archives.service";

@Controller("archives")
export class ArchivesController {
  constructor(private archivesService: ArchivesService) {}

  @Get()
  getAll() {
    return this.archivesService.getAll();
  }
}
