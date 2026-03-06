import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SupplyChainService } from './supply-chain.service';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(private readonly supplyChainService: SupplyChainService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.supplyChainService.seedIfEmpty();
      this.logger.log('Neo4j seed checked successfully.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Neo4j seed skipped: ${message}`);
    }
  }
}
