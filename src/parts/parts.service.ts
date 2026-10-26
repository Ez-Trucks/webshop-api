import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePartDto } from './dto/create-part.dto';
import { UpdatePartDto } from './dto/update-part.dto';

@Injectable()
export class PartsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.part.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const part = await this.prisma.part.findUnique({
      where: { id },
    });

    if (!part) {
      throw new NotFoundException('Onderdeel niet gevonden');
    }

    return part;
  }

  create(dto: CreatePartDto) {
    return this.prisma.part.create({
      data: {
        name: dto.name,
        partNumber: dto.partNumber,
        model: dto.model,
        category: dto.category,
        condition: dto.condition,
        price: dto.price,
        image: dto.image ?? null,
        stock: dto.stock ?? 1,
        warehouseLocation: dto.warehouseLocation?.trim() || null,
        year: dto.year ?? null,
        mileage: dto.mileage ?? null,
        euroNorm: dto.euroNorm?.trim() || null,
        axleConfig: dto.axleConfig?.trim() || null,
        powerHp: dto.powerHp ?? null,
        fuel: dto.fuel?.trim() || null,
        transmission: dto.transmission?.trim() || null,
        description: dto.description?.trim() || null,
      },
    });
  }

  async update(id: string, dto: UpdatePartDto) {
    await this.findOne(id);

    return this.prisma.part.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.partNumber !== undefined ? { partNumber: dto.partNumber } : {}),
        ...(dto.model !== undefined ? { model: dto.model } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.condition !== undefined ? { condition: dto.condition } : {}),
        ...(dto.price !== undefined ? { price: dto.price } : {}),
        ...(dto.image !== undefined ? { image: dto.image } : {}),
        ...(dto.stock !== undefined ? { stock: dto.stock } : {}),
        ...(dto.warehouseLocation !== undefined
          ? { warehouseLocation: dto.warehouseLocation.trim() || null }
          : {}),
        ...(dto.year !== undefined ? { year: dto.year } : {}),
        ...(dto.mileage !== undefined ? { mileage: dto.mileage } : {}),
        ...(dto.euroNorm !== undefined ? { euroNorm: dto.euroNorm.trim() || null } : {}),
        ...(dto.axleConfig !== undefined ? { axleConfig: dto.axleConfig.trim() || null } : {}),
        ...(dto.powerHp !== undefined ? { powerHp: dto.powerHp } : {}),
        ...(dto.fuel !== undefined ? { fuel: dto.fuel.trim() || null } : {}),
        ...(dto.transmission !== undefined ? { transmission: dto.transmission.trim() || null } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.part.delete({
      where: { id },
    });
  }
}
