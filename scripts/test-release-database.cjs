/* This smoke test is deliberately limited to an explicitly enabled local test DB. */
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
if (process.env.NODE_ENV !== 'test' || process.env.RELEASE_TEST_DATABASE !== '1') throw new Error('Use NODE_ENV=test and RELEASE_TEST_DATABASE=1 with an isolated local PostgreSQL database.');
const dbUrl = new URL(process.env.DATABASE_URL || '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(dbUrl.hostname)) throw new Error('Release test requires a localhost database.');
require('reflect-metadata');
const { Module, ValidationPipe } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { AuthService } = require('../dist/src/auth/auth.service');
const { AuthModule } = require('../dist/src/auth/auth.module');
const { PrismaModule } = require('../dist/src/prisma/prisma.module');
const { PrismaService } = require('../dist/src/prisma/prisma.service');
const { AdAssistantModule } = require('../dist/src/ad-assistant/ad-assistant.module');
const { OperationsController } = require('../dist/src/operations/operations.controller');
process.env.ADMIN_USERNAME = 'release-test';
const password = randomBytes(20).toString('hex');
process.env.ADMIN_PASSWORD_HASH = AuthService.hashPassword(password);
process.env.ADMIN_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.FRONTEND_URL = 'http://localhost:4200';
delete process.env.OPENAI_API_KEY;
class ReleaseTestModule {}
Module({ imports: [PrismaModule, AuthModule, AdAssistantModule], controllers: [OperationsController] })(ReleaseTestModule);
(async () => {
  const app = await NestFactory.create(ReleaseTestModule, { logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  const origin = await app.getUrl();
  const db = app.get(PrismaService);
  let draftId, partId, token;
  const call = async (path, method = 'GET', body, expected = 200, authorized = true) => {
    const response = await fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', ...(authorized && token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json();
    assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
    return data;
  };
  try {
    await call('/health');
    await call('/admin/ad-drafts', 'GET', undefined, 401, false);
    const session = await call('/auth/login', 'POST', { username: 'release-test', password }, 201, false); token = session.token;
    assert.ok(token);
    const readiness = await call('/admin/readiness');
    assert.equal(readiness.checks.find(c => c.key === 'schema').ok, true);
    const photo = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDx6iiiuwzP/9k=';
    let draft = await call('/admin/ad-drafts', 'POST', { title: 'Release test DAF XF', vin: '', notes: '', photos: [photo], documents: [] }, 201); draftId = draft.id;
    const path = `/admin/ad-drafts/${draft.id}`;
    const facts = [ ['brand','DAF'], ['type','XF'], ['category','Trekker'], ['year','2020'], ['mileage','544000'], ['damage','Chassis verroest'] ].map(([key,value]) => ({ key,value,source:'Release smoke test',certainty:'manual',confirmed:true }));
    const save = data => call(path, 'PATCH', { title: draft.title, vin: draft.vin, notes: draft.notes, photos: draft.photos, documents: draft.documents, facts: draft.facts, reference: draft.reference, price: draft.price, texts: draft.texts, revision: draft.revision, ...data });
    draft = await save({ facts, price: 25000 });
    await call(path + '/publish', 'POST', { approved: false, revision: draft.revision }, 400);
    draft = await call(path + '/standard-texts', 'POST', { revision: draft.revision }, 201);
    assert.ok(draft.texts.nl.includes('Chassis verroest'));
    const generatedText = draft.texts.nl;
    draft = await save({});
    assert.equal(draft.texts.nl, generatedText, 'JSONB roundtrip must preserve texts');
    await call(path, 'PATCH', { title: draft.title,vin:'',notes:'',photos:draft.photos,documents:[],facts:draft.facts,reference:'',price:draft.price,texts:draft.texts,revision:1 }, 409);
    const before = await db.part.count();
    draft = await call(path + '/publish', 'POST', { approved: true, revision: draft.revision }, 201); partId = draft.partId;
    assert.ok(partId);
    await call(path + '/publish', 'POST', { approved: true, revision: draft.revision }, 201);
    assert.equal(await db.part.count(), before + 1, 'Repeated publication must not duplicate vehicles');
    const part = await db.part.findUnique({ where: { id: partId } });
    assert.equal(part.year, 2020); assert.equal(part.mileage, 544000); assert.equal(part.price, 25000);
    assert.ok(part.description.includes('Chassis verroest'));
    await call(path + '/analyze', 'POST', { revision: draft.revision }, 409);
    console.log('PASS PostgreSQL: migrations, admin login, readiness, draft CRUD, JSONB, stale revisions, confirmed fields, defects and idempotent publication.');
  } finally {
    if (draftId) await db.vehicleAdDraft.deleteMany({ where: { id: draftId } });
    if (partId) await db.part.deleteMany({ where: { id: partId } });
    await app.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
