import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { SupplyChainService } from '../supply-chain.service';

type MutableRecord = Record<string, unknown>;

@Controller()
export class ProductsController {
  constructor(private readonly supplyChainService: SupplyChainService) {}

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

  @Get('products/:id/alternative-suppliers')
  getAlternativeSuppliers(@Param('id') id: string) {
    return this.supplyChainService.getAlternativeSuppliers(id);
  }
}
