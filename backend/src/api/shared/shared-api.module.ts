import { Global, Module } from '@nestjs/common';
import { Neo4jHttpService } from '../neo4j-http.service';
import { SeedService } from '../seed.service';
import { SupplyChainService } from '../supply-chain.service';

@Global()
@Module({
  providers: [Neo4jHttpService, SupplyChainService, SeedService],
  exports: [Neo4jHttpService, SupplyChainService],
})
export class SharedApiModule {}
