import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdAiService } from './ad-ai.service';
import { AttachmentDto, CreateDraftDto, FactDto, PublishDto, TranslationsDto, UpdateDraftDto } from './ad-assistant.dto';

const emptyTexts = () => ({ nl: '', en: '', fr: '', de: '' });
const json = (value: unknown): any => JSON.parse(JSON.stringify(value));
export const labels: Record<string, string[]> = {
  brand: ['Merk', 'Make', 'Marque', 'Marke'], type: ['Model', 'Model', 'Modèle', 'Modell'],
  category: ['Voertuigtype', 'Vehicle type', 'Type de véhicule', 'Fahrzeugtyp'], year: ['Bouwjaar', 'Year', 'Année', 'Baujahr'],
  mileage: ['Kilometerstand (km)', 'Mileage (km)', 'Kilométrage (km)', 'Kilometerstand (km)'],
  euroNorm: ['Euronorm', 'Emission class', 'Norme Euro', 'Abgasnorm'], axleConfig: ['Asconfiguratie', 'Axle configuration', 'Configuration des essieux', 'Achskonfiguration'],
  powerHp: ['Vermogen (pk)', 'Power (hp)', 'Puissance (ch)', 'Leistung (PS)'], fuel: ['Brandstof', 'Fuel', 'Carburant', 'Kraftstoff'],
  transmission: ['Versnellingsbak', 'Transmission', 'Boîte de vitesses', 'Getriebe'], equipment: ['Uitrusting', 'Equipment', 'Équipement', 'Ausstattung'],
  damage: ['Schade en gebreken', 'Damage and defects', 'Dommages et défauts', 'Schäden und Mängel'], condition: ['Technische staat', 'Technical condition', 'État technique', 'Technischer Zustand'],
};
@Injectable()
export class AdAssistantService {
  constructor(private prisma: PrismaService, private ai: AdAiService) {}
  capabilities() { return { aiEnabled: this.ai.enabled, externalPublishing: false, languages: ['nl', 'en', 'fr', 'de'] }; }
  list() {
    return this.prisma.vehicleAdDraft.findMany({ orderBy: { updatedAt: 'desc' }, take: 100,
      select: { id: true, title: true, reference: true, vin: true, status: true, revision: true, partId: true, updatedAt: true } });
  }
  async get(id: string) {
    const draft = await this.prisma.vehicleAdDraft.findUnique({ where: { id } });
    if (!draft) throw new NotFoundException('Concept niet gevonden.');
    return draft;
  }
  private validateFiles(dto: CreateDraftDto) {
    let total = 0;
    const check = (data: string, mime?: string) => {
      const match = /^data:(image\/jpeg|image\/png|image\/webp|application\/pdf|text\/plain);base64,([A-Za-z0-9+/]*={0,2})$/.exec(data);
      if (!match || (mime && mime !== match[1]) || match[2].length % 4 !== 0) throw new BadRequestException('Ongeldig bestand. Gebruik PDF, TXT, JPG, PNG of WebP.');
      const bytes = Buffer.from(match[2], 'base64');
      if (bytes.length === 0) throw new BadRequestException('Lege bestanden zijn niet toegestaan.');
      const type = match[1];
      const valid = type === 'text/plain' || (type === 'application/pdf' && bytes.subarray(0, 5).toString() === '%PDF-')
        || (type === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
        || (type === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
        || (type === 'image/webp' && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP');
      if (!valid) throw new BadRequestException('Bestandsinhoud komt niet overeen met het bestandstype.');
      total += bytes.length;
      return type;
    };
    for (const photo of dto.photos) if (!check(photo).startsWith('image/')) throw new BadRequestException('Een voertuigfoto moet een afbeelding zijn.');
    for (const doc of dto.documents) check(doc.data, doc.mime);
    if (total > 20 * 1024 * 1024) throw new BadRequestException('Alle bestanden samen mogen maximaal 20 MB zijn.');
  }
  async create(dto: CreateDraftDto) {
    this.validateFiles(dto);
    return this.prisma.vehicleAdDraft.create({ data: { ...dto, photos: json(dto.photos), documents: json(dto.documents),
      facts: [], texts: emptyTexts(), warnings: ['Een VIN alleen levert geen geverifieerde fabrieksopties op. Voeg een datakaart toe of bevestig de gegevens handmatig.'] } });
  }
  private editable(draft: { status: string; revision: number }, revision: number) {
    if (draft.status === 'published') throw new ConflictException('Dit concept is gepubliceerd. Bewerk het voertuig via Vrachtwagens beheren.');
    if (draft.revision !== revision) throw new ConflictException('Dit concept is intussen gewijzigd. Open het opnieuw voordat je verdergaat.');
  }
  private async change(id: string, revision: number, data: any) {
    const result = await this.prisma.vehicleAdDraft.updateMany({ where: { id, revision, status: { not: 'published' } }, data: { ...data, revision: { increment: 1 } } });
    if (result.count !== 1) throw new ConflictException('Het concept is intussen gewijzigd. Open het opnieuw.');
    return this.get(id);
  }
  private validateFacts(facts: FactDto[]) {
    if (new Set(facts.map(f => f.key)).size !== facts.length) throw new BadRequestException('Elk gegeven mag maar één keer voorkomen.');
    for (const f of facts.filter(f => f.value.trim())) {
      if (['year', 'mileage', 'powerHp'].includes(f.key)) {
        const n = Number(f.value);
        if (!Number.isInteger(n) || n < (f.key === 'year' ? 1900 : 0) || n > (f.key === 'year' ? new Date().getFullYear() + 1 : f.key === 'powerHp' ? 5000 : 10000000))
          throw new BadRequestException(`Ongeldige waarde voor ${labels[f.key][0]}. Gebruik een geheel getal zonder punten of eenheid.`);
      }
    }
  }
  async update(id: string, dto: UpdateDraftDto) {
    const draft = await this.get(id); this.editable(draft, dto.revision);
    this.validateFiles(dto); this.validateFacts(dto.facts);
    const { revision, ...data } = dto;
    // A source/fact change invalidates previously generated texts, even when sent by a stale client.
    const factSignature = (items: FactDto[]) => JSON.stringify(items.map(f => [f.key, f.value, f.source, f.certainty, f.confirmed]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
    const documentSignature = (items: AttachmentDto[]) => JSON.stringify(items.map(d => [d.name, d.mime, d.data]));
    const sourceChanged = factSignature(draft.facts as unknown as FactDto[]) !== factSignature(dto.facts) || draft.vin !== dto.vin || draft.notes !== dto.notes
      || JSON.stringify(draft.photos) !== JSON.stringify(dto.photos) || documentSignature(draft.documents as unknown as AttachmentDto[]) !== documentSignature(dto.documents);
    return this.change(id, revision, { ...data, photos: json(dto.photos), documents: json(dto.documents), facts: json(dto.facts),
      texts: sourceChanged ? emptyTexts() : json(dto.texts), status: 'draft' });
  }
  async analyze(id: string, revision: number) {
    const draft = await this.get(id); this.editable(draft, revision);
    const result = await this.ai.analyze(draft.vin, draft.notes, draft.photos as string[], draft.documents as unknown as AttachmentDto[]);
    const existing = draft.facts as unknown as FactDto[];
    // Never overwrite a manually confirmed field. Surface differences for review.
    const warnings = [...result.warnings];
    const facts = [...existing];
    for (const incoming of result.facts) {
      const index = facts.findIndex(f => f.key === incoming.key);
      if (index >= 0 && facts[index].confirmed) {
        if (facts[index].value !== incoming.value) warnings.push(`Verschil bij ${labels[incoming.key][0]}: bevestigd "${facts[index].value}", nieuwe bron "${incoming.value}" (${incoming.source}). Controleer dit.`);
      } else if (index >= 0) facts[index] = incoming;
      else facts.push(incoming);
    }
    return this.change(id, revision, { facts: json(facts), warnings: json(warnings), texts: emptyTexts(), status: 'draft' });
  }
  async generate(id: string, revision: number, ai: boolean) {
    const draft = await this.get(id); this.editable(draft, revision);
    const facts = (draft.facts as unknown as FactDto[]).filter(f => f.confirmed && f.value.trim());
    this.validateFacts(facts);
    if (!facts.length) throw new BadRequestException('Bevestig eerst minstens één voertuiggegeven.');
    let texts: TranslationsDto;
    if (ai) texts = await this.ai.write(facts);
    else {
      const contact = ['Neem contact op voor meer informatie.', 'Contact us for more information.', 'Contactez-nous pour plus d’informations.', 'Kontaktieren Sie uns für weitere Informationen.'];
      texts = emptyTexts();
      (['nl', 'en', 'fr', 'de'] as const).forEach((lang, i) => {
        texts[lang] = `Eeckeleers & Zonen\n\n${facts.map(f => `${labels[f.key][i]}: ${f.value}`).join('\n')}\n\n${contact[i]}`;
      });
    }
    for (const lang of ['nl', 'en', 'fr', 'de'] as const) if (typeof texts[lang] !== 'string' || !texts[lang].trim() || texts[lang].length > 12000) throw new BadRequestException('Ongeldige advertentietekst ontvangen.');
    return this.change(id, revision, { texts: json(texts), status: 'review' });
  }
  async publish(id: string, dto: PublishDto) {
    if (dto.approved !== true) throw new BadRequestException('Bevestig dat je de gegevens en advertentieteksten hebt gecontroleerd.');
    return this.prisma.$transaction(async tx => {
      const draft = await tx.vehicleAdDraft.findUnique({ where: { id } });
      if (!draft) throw new NotFoundException('Concept niet gevonden.');
      // Repeated clicks return the existing publication, never a second vehicle.
      if (draft.status === 'published') return draft;
      this.editable(draft, dto.revision);
      const facts = draft.facts as unknown as FactDto[]; this.validateFacts(facts);
      const value = (key: string) => facts.find(f => f.key === key && f.confirmed)?.value.trim() || '';
      const texts = draft.texts as unknown as TranslationsDto;
      if (!draft.title.trim() || !value('brand') || !value('type') || !value('category') || draft.price <= 0 || !texts.nl?.trim())
        throw new BadRequestException('Vul titel en prijs (> 0) in, bevestig merk, model en voertuigtype, en maak een Nederlandse advertentietekst.');
      if (!(draft.photos as string[]).length) throw new BadRequestException('Voeg minstens één voertuigfoto toe.');
      const reference = draft.reference.trim() || `EZ-${id.slice(0, 8).toUpperCase()}`;
      const duplicate = await tx.part.findFirst({ where: { partNumber: reference } });
      if (duplicate) throw new ConflictException('Deze referentie bestaat al bij de voertuigen. Kies een unieke referentie.');
      const claimed = await tx.vehicleAdDraft.updateMany({ where: { id, revision: dto.revision, status: { not: 'published' } },
        data: { status: 'published', publishedAt: new Date(), revision: { increment: 1 } } });
      if (!claimed.count) throw new ConflictException('Het concept is intussen gewijzigd. Open het opnieuw.');
      const part = await tx.part.create({ data: {
        name: draft.title.trim(), partNumber: reference, model: value('brand'), category: value('category'), condition: 'used',
        price: draft.price, stock: 1, image: JSON.stringify(draft.photos), description: texts.nl,
        year: value('year') ? Number(value('year')) : null, mileage: value('mileage') ? Number(value('mileage')) : null,
        powerHp: value('powerHp') ? Number(value('powerHp')) : null, euroNorm: value('euroNorm') || null,
        axleConfig: value('axleConfig') || null, fuel: value('fuel') || null, transmission: value('transmission') || null,
      } });
      return tx.vehicleAdDraft.update({ where: { id }, data: { partId: part.id, reference } });
    });
  }
  async remove(id: string, revision: number) {
    const draft = await this.get(id); this.editable(draft, revision);
    const result = await this.prisma.vehicleAdDraft.deleteMany({ where: { id, revision, status: { not: 'published' } } });
    if (!result.count) throw new ConflictException('Het concept is intussen gewijzigd.');
    return { deleted: true };
  }
}
