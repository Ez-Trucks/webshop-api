import {
  ConflictException,
  Injectable,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

type UserRole = 'admin' | 'customer';

type TokenPayload = {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
  exp: number;
};

type CustomerRecord = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
};

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly adminUsername = process.env.ADMIN_USERNAME;
  private readonly adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
  private readonly tokenSecret = process.env.ADMIN_AUTH_SECRET;
  private readonly tokenTtlSeconds = Number(process.env.ADMIN_TOKEN_TTL_SECONDS ?? 60 * 60 * 8);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS customer_accounts (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
  }

  async login(identifier: string, password: string): Promise<{ token: string; user: AuthUser } | null> {
    const admin = this.loginAdmin(identifier, password);

    if (admin) {
      return admin;
    }

    const email = this.normalizeEmail(identifier);
    const customers = await this.prisma.$queryRawUnsafe<CustomerRecord[]>(
      'SELECT id, email, name, password_hash FROM customer_accounts WHERE email = $1 LIMIT 1',
      email,
    );
    const customer = customers[0];

    if (!customer || !this.verifyPassword(password, customer.password_hash)) {
      return null;
    }

    const user: AuthUser = {
      id: customer.id,
      email: customer.email,
      name: customer.name,
      role: 'customer',
    };

    return {
      token: this.signToken(user),
      user,
    };
  }

  async register(name: string, email: string, password: string): Promise<{ token: string; user: AuthUser }> {
    this.getConfig();

    const normalizedEmail = this.normalizeEmail(email);
    const existing = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT id FROM customer_accounts WHERE email = $1 LIMIT 1',
      normalizedEmail,
    );

    if (existing.length > 0) {
      throw new ConflictException('Er bestaat al een account met dit e-mailadres');
    }

    const user: AuthUser = {
      id: randomBytes(16).toString('hex'),
      email: normalizedEmail,
      name: name.trim(),
      role: 'customer',
    };

    await this.prisma.$executeRawUnsafe(
      'INSERT INTO customer_accounts (id, email, name, password_hash) VALUES ($1, $2, $3, $4)',
      user.id,
      user.email,
      user.name,
      AuthService.hashPassword(password),
    );

    return {
      token: this.signToken(user),
      user,
    };
  }

  getUserFromToken(token: string): AuthUser | null {
    const payload = this.verifyAndDecodeToken(token);

    if (!payload) {
      return null;
    }

    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
    };
  }

  verifyToken(token: string): boolean {
    return !!this.verifyAndDecodeToken(token);
  }

  verifyAdminToken(token: string): boolean {
    return this.verifyAndDecodeToken(token)?.role === 'admin';
  }

  private loginAdmin(identifier: string, password: string): { token: string; user: AuthUser } | null {
    const config = this.getConfig();

    if (identifier !== config.username || !this.verifyPassword(password, config.passwordHash)) {
      return null;
    }

    const user: AuthUser = {
      id: 'admin',
      email: config.username,
      name: 'Admin',
      role: 'admin',
    };

    return {
      token: this.signToken(user),
      user,
    };
  }

  private verifyAndDecodeToken(token: string): TokenPayload | null {
    const config = this.getConfig();

    const [payloadPart, signature] = token.split('.');
    if (!payloadPart || !signature) {
      return null;
    }

    const expectedSignature = this.sign(payloadPart, config.tokenSecret);
    if (!this.safeEqual(signature, expectedSignature)) {
      return null;
    }

    try {
      const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString()) as TokenPayload;
      if (!['admin', 'customer'].includes(payload.role)) {
        return null;
      }
      return payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
    } catch {
      return null;
    }
  }

  private getConfig(): {
    username: string;
    passwordHash: string;
    tokenSecret: string;
  } {
    if (!this.adminUsername || !this.adminPasswordHash || !this.tokenSecret) {
      throw new ServiceUnavailableException('Auth is nog niet geconfigureerd');
    }

    return {
      username: this.adminUsername,
      passwordHash: this.adminPasswordHash,
      tokenSecret: this.tokenSecret,
    };
  }

  private verifyPassword(password: string, passwordHash: string): boolean {
    const [algorithm, salt, storedKey] = passwordHash.split(':');
    if (algorithm !== 'scrypt' || !salt || !storedKey) {
      return false;
    }

    const passwordKey = scryptSync(password, salt, 64).toString('base64url');
    return this.safeEqual(passwordKey, storedKey);
  }

  private signToken(user: AuthUser): string {
    const config = this.getConfig();
    const payload: TokenPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + this.tokenTtlSeconds,
    };
    const payloadPart = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${payloadPart}.${this.sign(payloadPart, config.tokenSecret)}`;
  }

  private sign(value: string, tokenSecret: string): string {
    return createHmac('sha256', tokenSecret).update(value).digest('base64url');
  }

  private safeEqual(a: string, b: string): boolean {
    const aBuffer = Buffer.from(a);
    const bBuffer = Buffer.from(b);
    return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  static hashPassword(password: string): string {
    const salt = randomBytes(16).toString('base64url');
    const key = scryptSync(password, salt, 64).toString('base64url');
    return `scrypt:${salt}:${key}`;
  }
}
