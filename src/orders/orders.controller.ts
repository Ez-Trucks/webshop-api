import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { Patch } from '@nestjs/common';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { AuthGuard } from '../auth/auth.guard';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.ordersService.create(dto);
  }

  @Get()
  @UseGuards(AuthGuard)
  findAll() {
    return this.ordersService.findAll();
  }

  @Get(':id/public')
  findPublicSummary(@Param('id') id: string) {
    return this.ordersService.findPublicSummary(id);
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }
  
  @Patch(':id/status')
  @UseGuards(AuthGuard)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(id, dto.status);
  }
}
