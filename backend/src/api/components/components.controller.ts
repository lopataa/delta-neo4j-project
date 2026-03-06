import { Controller, Get } from '@nestjs/common';
import { SupplyChainService } from '../supply-chain.service';

@Controller()
export class ComponentsController {
  constructor(private readonly supplyChainService: SupplyChainService) {}

  @Get('components')
  getComponents() {
    return this.supplyChainService.listComponents();
  }
}
