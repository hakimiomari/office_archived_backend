import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { ContractsService } from './contracts.service';
import { AuthGuard } from '../auth/guard/auth.guard';
import { Request } from 'express';

@ApiTags('Contracts')
@Controller('licenses/:licenseId/contracts')
@UseGuards(AuthGuard)
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload a contract file for a license' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Param('licenseId') licenseId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 50 * 1024 * 1024 })],
      }),
    )
    file: Express.Multer.File,
    @Req() req: Request,
  ) {
    const user = req['user'];
    return this.contractsService.upload(licenseId, file, String(user.sub));
  }

  @Get()
  @ApiOperation({ summary: 'Get all contracts for a license' })
  findByLicense(@Param('licenseId') licenseId: string) {
    return this.contractsService.findByLicense(licenseId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a contract' })
  remove(@Param('id') id: string) {
    return this.contractsService.remove(id);
  }
}
