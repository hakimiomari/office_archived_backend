import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;

  constructor() {
    this.client = new Redis({
      host: "localhost",
      port: 6379,
      password: "Kam",
    });
    this.client.on("error", (err) => {
      console.log("Redis Error:", err);
    });
  }

  async onModuleInit() {
    await this.client.ping();
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  async getClient() {
    this.client;
  }

  async setBlackListToken(token: string, expiresAt: number) {
    const tt1 = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    await this.client.set(`blacklist:${token}`, 1, "EX", tt1);
  }

  async isTokenBlackListed(token: string): Promise<boolean> {
    const result = await this.client.get(`blacklist:${token}`);
    return result === null ? false : true;
  }
}
