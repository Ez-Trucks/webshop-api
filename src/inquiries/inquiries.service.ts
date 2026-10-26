import { Injectable, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDepannageInquiryDto } from './dto/create-depannage-inquiry.dto';

export type DepannageInquiry = {
  id: string;
  name: string;
  company: string | null;
  email: string;
  phone: string;
  location: string;
  vehicleInfo: string;
  urgency: string;
  message: string | null;
  status: string;
  createdAt: Date;
};

@Injectable()
export class InquiriesService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS depannage_inquiries (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        company TEXT,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        location TEXT NOT NULL,
        vehicle_info TEXT NOT NULL,
        urgency TEXT NOT NULL,
        message TEXT,
        status TEXT NOT NULL DEFAULT 'new',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
  }

  async createDepannage(dto: CreateDepannageInquiryDto): Promise<DepannageInquiry> {
    const id = randomUUID();

    const rows = await this.prisma.$queryRawUnsafe<DepannageInquiry[]>(
      `
        INSERT INTO depannage_inquiries
          (id, name, company, email, phone, location, vehicle_info, urgency, message)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING
          id,
          name,
          company,
          email,
          phone,
          location,
          vehicle_info AS "vehicleInfo",
          urgency,
          message,
          status,
          created_at AS "createdAt"
      `,
      id,
      dto.name.trim(),
      dto.company?.trim() || null,
      dto.email.trim().toLowerCase(),
      dto.phone.trim(),
      dto.location.trim(),
      dto.vehicleInfo.trim(),
      dto.urgency,
      dto.message?.trim() || null,
    );

    return rows[0];
  }

  findAllDepannage(): Promise<DepannageInquiry[]> {
    return this.prisma.$queryRawUnsafe<DepannageInquiry[]>(`
      SELECT
        id,
        name,
        company,
        email,
        phone,
        location,
        vehicle_info AS "vehicleInfo",
        urgency,
        message,
        status,
        created_at AS "createdAt"
      FROM depannage_inquiries
      ORDER BY created_at DESC
    `);
  }
}
