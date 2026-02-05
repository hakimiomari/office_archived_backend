import { Test, TestingModule } from "@nestjs/testing";
import { beforeEach } from "node:test";
import { CreateUserProvider } from "./create-user.provider";

describe("CreateUserProvider", () => {
  let providers: CreateUserProvider;
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateUserProvider,
        { provide: "PrismaService", useValue: {} },
        { provide: "HashingProvider", useValue: {} },
        { provide: "FindOneUserByEmailProvider", useValue: {} },
        { provide: "TokenProvider", useValue: {} },
      ],
    }).compile();
    providers = module.get<CreateUserProvider>(CreateUserProvider);
    // Arrange
    // Act
    // Assert
  });
  it("should be defined", () => {
    expect(true).toBeDefined();
  });
});
