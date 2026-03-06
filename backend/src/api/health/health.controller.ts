import { Controller, Get } from '@nestjs/common';
import { SupplyChainService } from '../supply-chain.service';

@Controller()
export class HealthController {
  constructor(private readonly supplyChainService: SupplyChainService) {}

  @Get('health')
  getHealth() {
    return this.supplyChainService.getHealth();
  }
}
