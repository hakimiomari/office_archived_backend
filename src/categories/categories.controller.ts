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
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../guard/permissions.guard';
import { Permissions } from '../guard/permissions.decorator';
import { SubscriptionModuleGuard } from '../subscriptions/guards/subscription-module.guard';
import { SubscriptionFeatureGuard } from '../subscriptions/guards/subscription-feature.guard';
import { RequireModule } from '../subscriptions/decorators/require-module.decorator';
import { ModuleCode } from '@prisma/client';
import { CategoriesService } from './categories.service';
import {
  CategoryFilterDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './categories.dto';

@ApiTags('Categories')
@Controller('categories')
@UseGuards(
  AuthGuard,
  SubscriptionModuleGuard,
  SubscriptionFeatureGuard,
  PermissionGuard,
)
@RequireModule(ModuleCode.CATEGORIES)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get('tree')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'Full category hierarchy as a tree' })
  tree() {
    return this.categories.tree();
  }

  @Post()
  @Permissions('inventory.create')
  @ApiOperation({ summary: 'Create a category' })
  create(@Body() dto: CreateCategoryDto) {
    return this.categories.create(dto);
  }

  @Get()
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'List categories' })
  list(@Query() filters: CategoryFilterDto) {
    return this.categories.findAll(filters);
  }

  @Get(':id')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'Get a category by id' })
  get(@Param('id', ParseIntPipe) id: number) {
    return this.categories.findOne(id);
  }

  @Patch(':id')
  @Permissions('inventory.update')
  @ApiOperation({ summary: 'Update a category' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categories.update(id, dto);
  }

  @Delete(':id')
  @Permissions('inventory.delete')
  @ApiOperation({ summary: 'Delete a category' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.categories.remove(id);
  }
}
