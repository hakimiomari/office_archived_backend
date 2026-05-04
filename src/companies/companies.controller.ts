import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/guard/auth.guard";
import { SuperAdminGuard } from "../tenant/super-admin.guard";
import { CompaniesService } from "./companies.service";
import {
  CompanyFilterDto,
  CreateCompanyDto,
  UpdateCompanyDto,
} from "./companies.dto";

@ApiTags("Admin / Companies")
@Controller("admin/companies")
@UseGuards(AuthGuard, SuperAdminGuard)
export class CompaniesController {
  constructor(private readonly service: CompaniesService) {}

  @Post()
  @ApiOperation({ summary: "Create a company (tenant)" })
  create(@Body() dto: CreateCompanyDto) {
    return this.service.create(dto);
  }

  @Get("stats")
  @ApiOperation({ summary: "Cross-tenant stats for the super-admin dashboard" })
  stats() {
    return this.service.stats();
  }

  @Get()
  @ApiOperation({ summary: "List all companies" })
  list(@Query() filters: CompanyFilterDto) {
    return this.service.findAll(filters);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a company by id" })
  get(@Param("id", ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update a company" })
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.service.update(id, dto);
  }

  @Patch(":id/active")
  @ApiOperation({ summary: "Activate or deactivate a company" })
  setActive(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { isActive: boolean },
  ) {
    return this.service.setActive(id, body.isActive);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete a company and ALL its data (irreversible)" })
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
