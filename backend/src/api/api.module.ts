import { Module } from '@nestjs/common';
import { Neo4jHttpService } from './neo4j-http.service';
import { SeedService } from './seed.service';
import { SupplyChainController } from './supply-chain.controller';
import { SupplyChainService } from './supply-chain.service';

@Module({
  controllers: [SupplyChainController],
  providers: [Neo4jHttpService, SupplyChainService, SeedService],
})
export class ApiModule {}
