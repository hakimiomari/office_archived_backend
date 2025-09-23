import { Controller, Get } from "@nestjs/common";
import { ArchivesService } from "./archives.service";
import { ApiTags } from "@nestjs/swagger";

@Controller("archives")
@ApiTags("Archives")
export class ArchivesController {
  constructor(private archivesService: ArchivesService) {}

  @Get()
  getAll() {
    return this.archivesService.getAll();
  }
}
