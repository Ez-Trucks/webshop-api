import { BadGatewayException, ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdAiService } from './ad-ai.service';
import { AdAssistantService } from './ad-assistant.service';
import { CreateDraftDto, UpdateDraftDto } from './ad-assistant.dto';

const fact = (key: string, value: string, confirmed = true) => ({ key, value, source: 'Handmatig', certainty: 'manual', confirmed });
const picture = 'data:image/jpeg;base64,/9j/AA==';
const sample = () => ({ id: 'a1430565-69c4-4a2b-9dc3-516e889591b8', title: 'DAF XF 480', vin: '', notes: '', reference: 'TEST-1', price: 25000,
  revision: 1, status: 'draft', partId: null, photos: [picture], documents: [], warnings: [],
  facts: [fact('brand', 'DAF'), fact('type', 'XF 480'), fact('category', 'Trekker'), fact('year', '2020'), fact('equipment', 'ADR FL', false)],
  texts: { nl: 'DAF XF 480. Bekende schade aan de cabine.', en: '', fr: '', de: '' } });

describe('AI advertentieassistent — publicatie en controle', () => {
  let db: any; let ai: any; let service: AdAssistantService; let draft: any;
  beforeEach(() => {
    draft = sample();
    db = { vehicleAdDraft: { findUnique: jest.fn(async () => draft),
      updateMany: jest.fn(async ({ where, data }) => {
        if (draft.revision !== where.revision || draft.status === 'published') return { count: 0 };
        draft = { ...draft, ...data, revision: draft.revision + 1 }; return { count: 1 };
      }), update: jest.fn(async ({ data }) => (draft = { ...draft, ...data })), create: jest.fn(), deleteMany: jest.fn() },
      part: { findFirst: jest.fn(async () => null), create: jest.fn(async ({ data }) => ({ id: 'public-part', ...data })) } };
    db.$transaction = async (callback: any) => callback(db);
    ai = { enabled: true, analyze: jest.fn(), write: jest.fn() };
    service = new AdAssistantService(db, ai);
  });
  it('publiceert alleen na expliciete goedkeuring', async () => {
    await expect(service.publish(draft.id, { revision: 1, approved: false })).rejects.toThrow();
    expect(db.part.create).not.toHaveBeenCalled();
  });
  it('publiceert bevestigde velden en is idempotent bij een herhaalde klik', async () => {
    const first = await service.publish(draft.id, { revision: 1, approved: true });
    const second = await service.publish(draft.id, { revision: 1, approved: true });
    expect(first.partId).toBe('public-part'); expect(second.partId).toBe(first.partId);
    expect(db.part.create).toHaveBeenCalledTimes(1);
    expect(db.part.create.mock.calls[0][0].data).toMatchObject({ year: 2020, model: 'DAF', stock: 1, price: 25000 });
    expect(db.part.create.mock.calls[0][0].data.description).not.toContain('ADR');
  });
  it('blokkeert verouderde revisies en dubbele referenties', async () => {
    await expect(service.publish(draft.id, { revision: 9, approved: true })).rejects.toBeInstanceOf(ConflictException);
    db.part.findFirst.mockResolvedValue({ id: 'existing' });
    await expect(service.publish(draft.id, { revision: 1, approved: true })).rejects.toThrow('referentie');
    expect(db.part.create).not.toHaveBeenCalled();
  });
  it.each(['brand', 'type', 'category'])('vereist een bevestigd %s', async key => {
    draft.facts.find((f: any) => f.key === key).confirmed = false;
    await expect(service.publish(draft.id, { revision: 1, approved: true })).rejects.toThrow();
    expect(db.part.create).not.toHaveBeenCalled();
  });
  it('behoudt bevestigde feiten bij tegenstrijdige nieuwe AI-bronnen', async () => {
    ai.analyze.mockResolvedValue({ facts: [fact('brand', 'Volvo', false)], warnings: [] });
    const result = await service.analyze(draft.id, 1);
    expect(result.facts).toContainEqual(fact('brand', 'DAF'));
    expect(result.warnings[0]).toContain('Volvo');
    expect(result.texts.nl).toBe('');
  });
  it('stuurt alleen bevestigde feiten naar tekstgeneratie', async () => {
    ai.write.mockResolvedValue({ nl: 'NL', en: 'EN', fr: 'FR', de: 'DE' });
    await service.generate(draft.id, 1, true);
    expect(ai.write.mock.calls[0][0].some((f: any) => f.value === 'ADR FL')).toBe(false);
  });
  it('houdt bevestigde gebreken zichtbaar in standaardteksten', async () => {
    draft.facts.push(fact('damage', 'Chassis verroest'));
    const result = await service.generate(draft.id, 1, false);
    for (const lang of ['nl', 'en', 'fr', 'de']) {
      expect(result.texts[lang]).toContain('Chassis verroest');
      expect(result.texts[lang]).not.toContain('ADR FL');
    }
  });
  it('behoudt teksten als PostgreSQL JSONB de objectvelden in een andere volgorde teruggeeft', async () => {
    draft.facts = draft.facts.map((f: any) => ({ confirmed: f.confirmed, source: f.source, value: f.value, certainty: f.certainty, key: f.key }));
    const dto = { ...draft, facts: draft.facts.map((f: any) => ({ key: f.key, value: f.value, source: f.source, certainty: f.certainty, confirmed: f.confirmed })) };
    const result = await service.update(draft.id, dto);
    expect(result.texts.nl).toContain('DAF XF 480');
  });
  it('wist oude advertentieteksten na wijziging van een feit', async () => {
    const dto = { ...draft, facts: draft.facts.map((f: any) => f.key === 'brand' ? fact('brand', 'Volvo') : f) };
    const result = await service.update(draft.id, dto);
    expect(result.texts.nl).toBe('');
  });
  it('weigert niet-integer kilometerstand en bestanden met vals MIME-type', async () => {
    draft.facts.push(fact('mileage', '12.5'));
    await expect(service.publish(draft.id, { revision: 1, approved: true })).rejects.toThrow('Kilometerstand');
    await expect(service.create({ title: '', vin: '', notes: '', photos: ['data:image/jpeg;base64,SGVsbG8='], documents: [] })).rejects.toThrow('Bestandsinhoud');
  });
  it('blijft ongewijzigd wanneer AI uitvalt', async () => {
    ai.analyze.mockRejectedValue(new BadGatewayException('offline'));
    await expect(service.analyze(draft.id, 1)).rejects.toThrow('offline');
    expect(db.vehicleAdDraft.updateMany).not.toHaveBeenCalled();
  });
  it('laat gepubliceerde concepten niet opnieuw bewerken', async () => {
    draft.status = 'published';
    await expect(service.analyze(draft.id, 1)).rejects.toThrow('gepubliceerd');
    expect(ai.analyze).not.toHaveBeenCalled();
  });
});

describe('Invoervalidatie', () => {
  it.each([30, 31])('controleert de fotolimiet bij %s foto’s voor maken en bijwerken', async count => {
    for (const Dto of [CreateDraftDto, UpdateDraftDto]) {
      const errors = await validate(plainToInstance(Dto, { ...sample(), photos: Array(count).fill(picture) }));
      expect(errors.some(e => e.property === 'photos')).toBe(count > 30);
    }
  });
  it('weigert ongeldige VINs en extra clientvelden', async () => {
    const errors = await validate(plainToInstance(CreateDraftDto, { title: '', vin: 'INVALID', notes: '', photos: [], documents: [], status: 'published' }), { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.map(e => e.property)).toEqual(expect.arrayContaining(['vin', 'status']));
  });
  it('weigert ontbrekende advertentieteksten', async () => {
    const draft = sample(); const { texts, ...rest } = draft;
    const errors = await validate(plainToInstance(UpdateDraftDto, rest), { whitelist: true });
    expect(errors.map(e => e.property)).toContain('texts');
  });
});

describe('AI-provider', () => {
  let previous: string | undefined;
  beforeEach(() => { previous = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = 'test-only'; });
  afterEach(() => { if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous; jest.restoreAllMocks(); });
  it('gebruikt gestructureerde invoer, servercredentials en store:false', async () => {
    const spy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ facts: [], warnings: [] }) }] }] }) } as Response);
    await new AdAiService().analyze('XLRTEH4300G123456', 'Cabine beschadigd', [], []);
    const body = JSON.parse(spy.mock.calls[0][1]?.body as string);
    expect(body.store).toBe(false); expect(body.text.format.strict).toBe(true);
    expect(body.input[0].content[0].text).toContain('Cabine beschadigd');
  });
  it('weigert incomplete of geweigerde AI-antwoorden', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ status: 'incomplete', output: [] }) } as unknown as Response);
    await expect(new AdAiService().analyze('', '', [], [])).rejects.toThrow('geen volledig resultaat');
  });
  it('toont een bruikbare melding zonder API-sleutel', async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(new AdAiService().analyze('', '', [], [])).rejects.toThrow('Handmatig');
  });
});

// Real Nest HTTP routing, guard and global validation; no production database or AI requests.
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AdAssistantController } from './ad-assistant.controller';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';

describe('Beveiligde admin HTTP-routes', () => {
  let app: INestApplication;
  const service = { capabilities: jest.fn(() => ({ aiEnabled: false })), list: jest.fn(() => []), create: jest.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [AdAssistantController], providers: [AuthGuard,
      { provide: AuthService, useValue: { verifyAdminToken: (token: string) => token === 'test-admin-token' } },
      { provide: AdAssistantService, useValue: service }] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => app.close());
  it.each([
    ['get', ''], ['get', '/capabilities'], ['get', '/a1430565-69c4-4a2b-9dc3-516e889591b8'], ['post', ''],
    ['patch', '/a1430565-69c4-4a2b-9dc3-516e889591b8'], ['delete', '/a1430565-69c4-4a2b-9dc3-516e889591b8'],
    ['post', '/a1430565-69c4-4a2b-9dc3-516e889591b8/analyze'], ['post', '/a1430565-69c4-4a2b-9dc3-516e889591b8/generate'],
    ['post', '/a1430565-69c4-4a2b-9dc3-516e889591b8/standard-texts'], ['post', '/a1430565-69c4-4a2b-9dc3-516e889591b8/publish'],
  ])('weigert anonieme %s %s', async (method, path) => {
    await request(app.getHttpServer())[method](`/admin/ad-drafts${path}`).expect(401);
  });
  it('laat een admin binnen en weigert statusinjectie', async () => {
    await request(app.getHttpServer()).get('/admin/ad-drafts').set('Authorization', 'Bearer test-admin-token').expect(200, []);
    await request(app.getHttpServer()).post('/admin/ad-drafts').set('Authorization', 'Bearer test-admin-token')
      .send({ title: 'DAF', vin: '', notes: '', photos: [], documents: [], status: 'published' }).expect(400);
    expect(service.create).not.toHaveBeenCalled();
  });
});
