import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MinioService } from '../minio/minio.service';

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly minioService: MinioService,
  ) {}

  async upload(
    licenseId: string,
    file: Express.Multer.File,
    uploadedBy: string,
  ) {
    // Verify license exists
    const license = await this.prisma.license.findUnique({
      where: { id: licenseId },
    });
    if (!license) {
      throw new NotFoundException(`License with id ${licenseId} not found`);
    }

    const { url, fileName } = await this.minioService.upload(
      file,
      `licenses/${licenseId}`,
    );

    return this.prisma.contract.create({
      data: {
        licenseId,
        fileName: file.originalname,
        fileUrl: url,
        fileType: file.mimetype,
        uploadedBy,
      },
    });
  }

  async findByLicense(licenseId: string) {
    return this.prisma.contract.findMany({
      where: { licenseId },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  async remove(id: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
    });
    if (!contract) {
      throw new NotFoundException(`Contract with id ${id} not found`);
    }
    await this.prisma.contract.delete({ where: { id } });
    return { message: 'Contract deleted successfully' };
  }
}
