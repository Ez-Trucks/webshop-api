import { Controller, Get, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@Controller()
export class OperationsController {
  constructor(private prisma: PrismaService) {}
  @Get('health')
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch { throw new ServiceUnavailableException('Database niet bereikbaar.'); }
  }
  @Get('admin/readiness')
  @UseGuards(AuthGuard)
  async readiness() {
    let database = false;
    let schema = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`; database = true;
      // Zero-row projections validate required columns without exposing stock or source files.
      await this.prisma.$queryRaw`SELECT "stock", "warehouseLocation", "year", "mileage", "euroNorm", "axleConfig", "powerHp", "fuel", "transmission", "description" FROM "Part" LIMIT 0`;
      await this.prisma.$queryRaw`SELECT "id", "revision", "partId", "facts", "documents", "texts" FROM "VehicleAdDraft" LIMIT 0`;
      schema = true;
    } catch { /* Return a useful admin check while keeping database details private. */ }
    const mail = Boolean(process.env.POSTMARK_SERVER_TOKEN && process.env.MAIL_FROM && (process.env.ADMIN_ORDER_EMAIL || process.env.MAIL_FROM));
    const checks = [
      { key: 'database', label: 'Database bereikbaar', ok: database, required: true },
      { key: 'schema', label: 'Voertuigvelden en conceptopslag bijgewerkt', ok: schema, required: true },
      { key: 'auth', label: 'Adminbeveiliging ingesteld', ok: Boolean(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD_HASH && process.env.ADMIN_AUTH_SECRET && Buffer.byteLength(process.env.ADMIN_AUTH_SECRET, 'utf8') >= 32), required: true },
      { key: 'frontend', label: 'Websiteadres ingesteld op de API', ok: Boolean(process.env.FRONTEND_URL), required: true },
      { key: 'mail', label: 'Mailinstellingen aanwezig (bezorging nog apart te testen)', ok: mail, required: true },
      { key: 'ai', label: 'AI-sleutel ingesteld (toegang en tegoed nog apart te testen)', ok: Boolean(process.env.OPENAI_API_KEY?.trim()), required: false },
    ];
    return { ready: checks.filter(c => c.required).every(c => c.ok), checks, externalPublishing: false };
  }
}
