import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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

  async create(dto: CreateOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const stockItems = dto.items.filter((item) => item.partId);

      for (const item of stockItems) {
        const part = await tx.part.findUnique({
          where: { id: item.partId },
        });

        if (!part) {
          throw new BadRequestException(`Onderdeel ${item.name} bestaat niet meer.`);
        }

        if (part.stock < item.quantity) {
          throw new BadRequestException(
            `Niet genoeg voorraad voor ${part.name}. Beschikbaar: ${part.stock}.`,
          );
        }
      }

      for (const item of stockItems) {
        await tx.part.update({
          where: { id: item.partId },
          data: {
            stock: {
              decrement: item.quantity,
            },
          },
        });
      }

      return tx.order.create({
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
    });
  }
}
