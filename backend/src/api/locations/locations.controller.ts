import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SupplyChainService } from '../supply-chain.service';

type MutableRecord = Record<string, unknown>;

@Controller()
export class LocationsController {
  constructor(private readonly supplyChainService: SupplyChainService) {}

  @Get('locations')
  getLocations() {
    return this.supplyChainService.listLocations();
  }

  @Post('locations')
  createLocation(@Body() body: MutableRecord) {
    return this.supplyChainService.createLocation(body);
  }

  @Get('locations/:id/inventory-status')
  getInventoryStatus(@Param('id') id: string) {
    return this.supplyChainService.getInventoryStatus(id);
  }
}
