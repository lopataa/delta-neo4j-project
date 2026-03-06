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
import { SupplyChainService } from './supply-chain.service';

type MutableRecord = Record<string, unknown>;

@Controller()
export class SupplyChainController {
  constructor(private readonly supplyChainService: SupplyChainService) {}

  @Get('health')
  getHealth() {
    return this.supplyChainService.getHealth();
  }

  @Get('products')
  getProducts() {
    return this.supplyChainService.listProducts();
  }

  @Post('products')
  createProduct(@Body() body: MutableRecord) {
    return this.supplyChainService.createProduct(body);
  }

  @Get('products/:id')
  getProduct(@Param('id') id: string) {
    return this.supplyChainService.getProductById(id);
  }

  @Put('products/:id')
  updateProduct(@Param('id') id: string, @Body() body: MutableRecord) {
    return this.supplyChainService.updateProduct(id, body);
  }

  @Delete('products/:id')
  deleteProduct(@Param('id') id: string) {
    return this.supplyChainService.deleteProduct(id);
  }

  @Get('companies')
  getCompanies() {
    return this.supplyChainService.listCompanies();
  }

  @Get('locations')
  getLocations() {
    return this.supplyChainService.listLocations();
  }

  @Post('locations')
  createLocation(@Body() body: MutableRecord) {
    return this.supplyChainService.createLocation(body);
  }

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

  @Get('components')
  getComponents() {
    return this.supplyChainService.listComponents();
  }

  @Post('companies')
  createCompany(@Body() body: MutableRecord) {
    return this.supplyChainService.createCompany(body);
  }

  @Put('companies/:id')
  updateCompany(@Param('id') id: string, @Body() body: MutableRecord) {
    return this.supplyChainService.updateCompany(id, body);
  }

  @Delete('companies/:id')
  deleteCompany(@Param('id') id: string) {
    return this.supplyChainService.deleteCompany(id);
  }

  @Get('orders')
  getOrders() {
    return this.supplyChainService.listOrders();
  }

  @Post('orders')
  createOrder(@Body() body: MutableRecord) {
    return this.supplyChainService.createOrder(body);
  }

  @Delete('orders/:id')
  deleteOrder(@Param('id') id: string) {
    return this.supplyChainService.deleteOrder(id);
  }

  @Put('orders/:id/status')
  updateOrderStatus(
    @Param('id') id: string,
    @Body() body: { status?: string },
  ) {
    return this.supplyChainService.updateOrderStatus(
      id,
      body?.status ?? 'pending',
    );
  }

  @Get('products/:id/bom')
  getBom(@Param('id') id: string) {
    return this.supplyChainService.getBom(id);
  }

  @Get('products/:id/bom/tree')
  getBomTree(@Param('id') id: string) {
    return this.supplyChainService.getBomTree(id);
  }

  @Get('products/:id/bom/detailed')
  getDetailedBom(@Param('id') id: string) {
    return this.supplyChainService.getDetailedBom(id);
  }

  @Post('products/:id/bom')
  addComponentToBom(@Param('id') id: string, @Body() body: MutableRecord) {
    return this.supplyChainService.addComponentToBom(id, body);
  }

  @Put('products/:id/bom/:componentId')
  updateBomComponent(
    @Param('id') id: string,
    @Param('componentId') componentId: string,
    @Body() body: MutableRecord,
  ) {
    return this.supplyChainService.updateBomComponent(id, componentId, body);
  }

  @Delete('products/:id/bom/:componentId')
  deleteBomComponent(
    @Param('id') id: string,
    @Param('componentId') componentId: string,
  ) {
    return this.supplyChainService.deleteBomComponent(id, componentId);
  }

  @Get('orders/:orderId/supply-path')
  getOrderSupplyPath(@Param('orderId') orderId: string) {
    return this.supplyChainService.getOrderSupplyPath(orderId);
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

  @Get('companies/:id/risk-assessment')
  getCompanyRiskAssessment(@Param('id') id: string) {
    return this.supplyChainService.getCompanyRiskAssessment(id);
  }

  @Get('analytics/supply-chain-health')
  getSupplyChainHealth() {
    return this.supplyChainService.getSupplyChainHealth();
  }

  @Get('products/:id/alternative-suppliers')
  getAlternativeSuppliers(@Param('id') id: string) {
    return this.supplyChainService.getAlternativeSuppliers(id);
  }

  @Get('analytics/impact-analysis')
  getImpactAnalysis(@Query('supplier') supplier: string) {
    return this.supplyChainService.getImpactAnalysis(supplier);
  }

  @Get('locations/:id/inventory-status')
  getInventoryStatus(@Param('id') id: string) {
    return this.supplyChainService.getInventoryStatus(id);
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

  @Post('admin/seed')
  seedData(@Query('force') force = 'false') {
    return this.supplyChainService.seedData(force === 'true');
  }

  @Delete('admin/data')
  deleteAllData() {
    return this.supplyChainService.deleteAllData();
  }
}
