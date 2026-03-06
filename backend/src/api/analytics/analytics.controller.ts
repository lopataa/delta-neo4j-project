import { Controller, Get, Param, Query } from '@nestjs/common';
import { SupplyChainService } from '../supply-chain.service';

@Controller()
export class AnalyticsController {
  constructor(private readonly supplyChainService: SupplyChainService) {}

  @Get('analytics/supply-chain-health')
  getSupplyChainHealth() {
    return this.supplyChainService.getSupplyChainHealth();
  }

  @Get('analytics/impact-analysis')
  getImpactAnalysis(@Query('supplier') supplier: string) {
    return this.supplyChainService.getImpactAnalysis(supplier);
  }

  @Get('analytics/cost-breakdown/:orderId')
  getCostBreakdown(@Param('orderId') orderId: string) {
    return this.supplyChainService.getCostBreakdown(orderId);
  }

  @Get('analytics/forecast-delays')
  getForecastDelays(@Query('months') months = '3') {
    return this.supplyChainService.forecastDelays(Number(months));
  }

  @Get('analytics/stock-levels')
  getStockLevels(
    @Query('product') product: string,
    @Query('horizon') horizon = 'months=6',
  ) {
    return this.supplyChainService.forecastStockLevels(product, horizon);
  }
}
