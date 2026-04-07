import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private client: Minio.Client;
  private bucketName: string;
  private connected = false;

  constructor(private readonly configService: ConfigService) {
    this.client = new Minio.Client({
      endPoint: this.configService.get('MINIO_ENDPOINT', 'localhost'),
      port: parseInt(this.configService.get('MINIO_PORT', '9000')),
      useSSL: this.configService.get('MINIO_USE_SSL', 'false') === 'true',
      accessKey: this.configService.get('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: this.configService.get('MINIO_SECRET_KEY', 'minioadmin'),
    });
    this.bucketName = this.configService.get('MINIO_BUCKET', 'contracts');
  }

  async onModuleInit() {
    try {
      const exists = await this.client.bucketExists(this.bucketName);
      if (!exists) {
        await this.client.makeBucket(this.bucketName);
      }
      this.connected = true;
      this.logger.log('MinIO connected successfully');
    } catch (error) {
      this.logger.warn(
        'MinIO is not available — file uploads will fail until MinIO is running',
      );
    }
  }

  async upload(
    file: Express.Multer.File,
    folder: string,
  ): Promise<{ url: string; fileName: string }> {
    const fileName = `${folder}/${Date.now()}-${file.originalname}`;
    await this.client.putObject(
      this.bucketName,
      fileName,
      file.buffer,
      file.size,
      { 'Content-Type': file.mimetype },
    );

    const endpoint = this.configService.get('MINIO_ENDPOINT', 'localhost');
    const port = this.configService.get('MINIO_PORT', '9000');
    const protocol =
      this.configService.get('MINIO_USE_SSL', 'false') === 'true'
        ? 'https'
        : 'http';
    const url = `${protocol}://${endpoint}:${port}/${this.bucketName}/${fileName}`;

    return { url, fileName };
  }

  async delete(fileName: string): Promise<void> {
    await this.client.removeObject(this.bucketName, fileName);
  }

  async getPresignedUrl(fileName: string, expiry = 3600): Promise<string> {
    return this.client.presignedGetObject(this.bucketName, fileName, expiry);
  }
}
