import { allowedOrigins, originAllowed } from './cors';
import { OperationsController } from './operations.controller';

describe('Productiecontrole', () => {
  it('accepteert alleen expliciet toegestane websites in productie', () => {
    const origins = allowedOrigins({ NODE_ENV: 'production', FRONTEND_URL: 'https://ez-trucks.com', CORS_ORIGINS: 'https://www.ez-trucks.com,https://webshop-blue-beta.vercel.app' });
    expect(originAllowed('https://ez-trucks.com', origins)).toBe(true);
    expect(originAllowed('https://www.ez-trucks.com', origins)).toBe(true);
    expect(originAllowed('https://unrelated.vercel.app', origins)).toBe(false);
    expect(originAllowed('http://localhost:4200', origins)).toBe(false);
    expect(originAllowed('https://ez-trucks.com.attacker.invalid', origins)).toBe(false);
    expect(originAllowed(undefined, origins)).toBe(true);
  });
  it('weigert ongeldige originconfiguratie en staat localhost alleen in ontwikkeling toe', () => {
    const origins = allowedOrigins({ NODE_ENV: 'development', CORS_ORIGINS: 'not-a-url,https://valid.invalid/path,https://user:pass@invalid.invalid' });
    expect([...origins]).toEqual(['http://localhost:4200', 'http://127.0.0.1:4200']);
  });
  it('geeft geen gezonde status terug wanneer de database uitvalt', async () => {
    const controller = new OperationsController({ $queryRaw: jest.fn().mockRejectedValue(new Error('connection details')) } as any);
    await expect(controller.health()).rejects.toThrow('Database niet bereikbaar.');
  });
  it('merkt een oude databasestructuur aan als onklaar', async () => {
    const query = jest.fn().mockResolvedValueOnce([{ '?column?': 1 }]).mockRejectedValueOnce(new Error('missing column'));
    const result = await new OperationsController({ $queryRaw: query } as any).readiness();
    expect(result.ready).toBe(false);
    expect(result.checks.find(c => c.key === 'database')?.ok).toBe(true);
    expect(result.checks.find(c => c.key === 'schema')?.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain('missing column');
  });
});

import { AuthService } from '../auth/auth.service';

describe('Adminsignering', () => {
  it('weigert een korte voorbeeldsleutel voordat een sessie kan worden uitgegeven', async () => {
    const saved = { username: process.env.ADMIN_USERNAME, hash: process.env.ADMIN_PASSWORD_HASH, secret: process.env.ADMIN_AUTH_SECRET };
    try {
      process.env.ADMIN_USERNAME = 'test-admin';
      process.env.ADMIN_PASSWORD_HASH = AuthService.hashPassword('safe-test-password');
      process.env.ADMIN_AUTH_SECRET = 'example-key';
      await expect(new AuthService({} as any).login('test-admin', 'safe-test-password')).rejects.toThrow('minstens 32 bytes');
    } finally {
      for (const [key, value] of Object.entries({ ADMIN_USERNAME: saved.username, ADMIN_PASSWORD_HASH: saved.hash, ADMIN_AUTH_SECRET: saved.secret })) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  });
});
