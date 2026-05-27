import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { MailService } from '../mail/mail.service';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  findAll() {
    return this.prisma.order.findMany({
      include: {
        items: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Bestelling niet gevonden');
    }

    return order;
  }

  async findPublicSummary(id: string) {
    const order = await this.findOne(id);

    return {
      id: order.id,
      customerName: order.customerName,
      status: order.status,
      totalPrice: order.totalPrice,
      items: order.items.map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
      })),
    };
  }
  
  async updateStatus(id: string, status: string) {
    const currentOrder = await this.findOne(id);

    const updatedOrder = await this.prisma.order.update({
      where: { id },
      data: { status },
      include: {
        items: true,
      },
    });

    if (status === 'shipped' && currentOrder.status !== 'shipped') {
      await this.mailService.sendShippingConfirmation(updatedOrder);
    }

    return updatedOrder;
  }
  
  async markAsPaid(id: string) {
    await this.findOne(id);

    return this.prisma.order.update({
      where: { id },
      data: { status: 'paid' },
    });
  }

  create(dto: CreateOrderDto) {
    return this.prisma.order.create({
      data: {
        customerName: dto.customerName,
        email: dto.email,
        phone: dto.phone ?? null,
        address: dto.address,
        city: dto.city,
        postalCode: dto.postalCode,
        country: dto.country,
        totalPrice: dto.totalPrice,
        status: 'pending',
        items: {
          create: dto.items.map((item) => ({
            partId: item.partId ?? null,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
          })),
        },
      },
      include: {
        items: true,
      },
    });
  }
}
