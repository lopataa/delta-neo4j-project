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
export class OrdersController {
  constructor(private readonly supplyChainService: SupplyChainService) {}

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

  @Get('orders/:orderId/supply-path')
  getOrderSupplyPath(@Param('orderId') orderId: string) {
    return this.supplyChainService.getOrderSupplyPath(orderId);
  }
}
