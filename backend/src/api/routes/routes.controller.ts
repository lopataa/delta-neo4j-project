import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { SupplyChainService } from '../supply-chain.service';

type MutableRecord = Record<string, unknown>;

@Controller()
export class RoutesController {
  constructor(private readonly supplyChainService: SupplyChainService) {}

  @Get('routes')
  getRoutes() {
    return this.supplyChainService.listRoutes();
  }

  @Post('routes')
  createRoute(@Body() body: MutableRecord) {
    return this.supplyChainService.createRoute(body);
  }

  @Put('routes/:id')
  updateRoute(@Param('id') id: string, @Body() body: MutableRecord) {
    return this.supplyChainService.updateRoute(id, body);
  }

  @Delete('routes/:id')
  deleteRoute(@Param('id') id: string) {
    return this.supplyChainService.deleteRoute(id);
  }

  @Get('routes/optimal')
  getOptimalRoutes(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('weight') weight = '1',
    @Query('optimize') optimize = 'balanced',
  ) {
    return this.supplyChainService.getOptimalRoutes(
      from,
      to,
      Number(weight),
      optimize,
    );
  }
}
