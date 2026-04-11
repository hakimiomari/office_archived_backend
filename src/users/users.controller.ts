import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RoleDto } from './dto/RoleDto.dto';
import { UserService } from './users.service';
import { AuthGuard } from 'src/auth/guard/auth.guard';
import { PermissionGuard } from 'src/guard/permissions.guard';
import { Permissions } from 'src/guard/permissions.decorator';
import { ApiTags, ApiOperation, ApiQuery, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { CreateUserDto } from './dto/CreateUserDto.dot';
import { UpdateUserDto } from './dto/UpdateUserDto.dto';
import { ChangePasswordDto } from './dto/ChangePasswordDto.dto';

@Controller('user')
@ApiTags('User')
export class UserController {
  constructor(private userService: UserService) {}

  @Post('create')
  @UseGuards(AuthGuard, PermissionGuard)
  @Permissions('user.create')
  @ApiOperation({ summary: 'Create a new user' })
  async create(@Body() createUserDto: CreateUserDto) {
    return this.userService.createUser(createUserDto);
  }

  @UseGuards(AuthGuard, PermissionGuard)
  @Permissions('user.read')
  @Get('list')
  @ApiOperation({ summary: 'List all users with pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.userService.findAll(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 10,
      search,
    );
  }

  @UseGuards(AuthGuard)
  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile' })
  async profile(@Req() request: any) {
    return await this.userService.profile(request?.user);
  }

  @UseGuards(AuthGuard, PermissionGuard)
  @Permissions('user.read')
  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.userService.findOne(id);
  }

  @UseGuards(AuthGuard, PermissionGuard)
  @Permissions('user.update')
  @Patch(':id')
  @ApiOperation({ summary: 'Update a user' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ) {
    return this.userService.updateUser(id, dto);
  }

  @UseGuards(AuthGuard, PermissionGuard)
  @Permissions('user.delete')
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a user' })
  async delete(@Param('id', ParseIntPipe) id: number) {
    return this.userService.deleteUser(id);
  }

  @UseGuards(AuthGuard)
  @Post('change-password')
  @ApiOperation({ summary: 'Change current user password' })
  async changePassword(@Req() request: any, @Body() dto: ChangePasswordDto) {
    return this.userService.changePassword(request.user.sub, dto);
  }

  @UseGuards(AuthGuard)
  @Patch('profile/update')
  @ApiOperation({ summary: 'Update current user profile' })
  async updateProfile(@Req() request: any, @Body() dto: UpdateUserDto) {
    return this.userService.updateUser(request.user.sub, dto);
  }

  @UseGuards(AuthGuard)
  @Post('profile/upload-picture')
  @ApiOperation({ summary: 'Upload profile picture' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadProfilePicture(
    @Req() request: any,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|gif|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.userService.uploadProfilePicture(request.user.sub, file);
  }

  @UseGuards(AuthGuard, PermissionGuard)
  @Permissions('user.update')
  @Post('assign_role')
  @ApiOperation({ summary: 'Assign role to user' })
  async assignRole(@Body() dto: RoleDto) {
    return this.userService.assignRole(dto);
  }
}
