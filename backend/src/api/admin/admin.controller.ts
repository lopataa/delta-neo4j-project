import { Controller, Delete, Post, Query } from '@nestjs/common';
import { SupplyChainService } from '../supply-chain.service';

@Controller()
export class AdminController {
  constructor(private readonly supplyChainService: SupplyChainService) {}

  @Post('admin/seed')
  seedData(@Query('force') force = 'false') {
    return this.supplyChainService.seedData(force === 'true');
  }

  @Delete('admin/data')
  deleteAllData() {
    return this.supplyChainService.deleteAllData();
  }
}
