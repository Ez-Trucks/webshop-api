import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import * as postmark from 'postmark';

type OrderItem = {
  name: string;
  price: number;
  quantity: number;
};

type MailOrder = {
  id: string;
  customerName: string;
  email: string;
  phone?: string | null;
  address: string;
  postalCode: string;
  city: string;
  country: string;
  status: string;
  totalPrice: number;
  items: OrderItem[];
};

type DepannageRequest = {
  name: string;
  company?: string;
  email: string;
  phone: string;
  location: string;
  vehicleInfo: string;
  urgency: string;
  message?: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private client: postmark.ServerClient | null;

  constructor() {
    const token = process.env.POSTMARK_SERVER_TOKEN;

    this.client = token ? new postmark.ServerClient(token) : null;
  }

  private requireClient(): postmark.ServerClient {
    if (!this.client || !process.env.MAIL_FROM) throw new ServiceUnavailableException('E-mail is nog niet ingesteld.');
    return this.client;
  }

  async sendOrderConfirmation(email: string, order: MailOrder) {
    return this.sendEmail({
      to: email,
      subject: `Bestelling betaald - ${this.shortOrderId(order.id)}`,
      title: 'Bedankt voor je bestelling',
      intro: `Hallo ${this.escape(order.customerName)}, we hebben je betaling goed ontvangen. We gaan je bestelling nu verwerken.`,
      order,
      footer:
        'Heb je vragen over je bestelling? Antwoord gerust op deze mail of contacteer Eeckeleers & Zonen.',
    });
  }

  async sendAdminPaidOrderNotification(order: MailOrder) {
    const adminEmail = process.env.ADMIN_ORDER_EMAIL || process.env.MAIL_FROM;

    if (!adminEmail) {
      this.logger.warn('ADMIN_ORDER_EMAIL en MAIL_FROM ontbreken; adminmail niet verstuurd.');
      return;
    }

    return this.sendEmail({
      to: adminEmail,
      subject: `Nieuwe betaalde bestelling - ${this.shortOrderId(order.id)}`,
      title: 'Nieuwe betaalde bestelling',
      intro: `${this.escape(order.customerName)} heeft een bestelling betaald. Controleer de bestelling in het adminpaneel.`,
      order,
      footer: 'Deze mail is automatisch verstuurd door de EZ-Trucks webshop.',
      includeCustomerBlock: true,
    });
  }

  async sendShippingConfirmation(order: MailOrder) {
    return this.sendEmail({
      to: order.email,
      subject: `Bestelling verzonden - ${this.shortOrderId(order.id)}`,
      title: 'Je bestelling is verzonden',
      intro: `Hallo ${this.escape(order.customerName)}, je bestelling staat op verzonden. Bedankt voor je vertrouwen in Eeckeleers & Zonen.`,
      order,
      footer:
        'De levering is onderweg. Contacteer ons gerust als je nog vragen hebt over je bestelling.',
    });
  }

  async sendDepannageRequest(request: DepannageRequest) {
    const adminEmail = process.env.ADMIN_ORDER_EMAIL || process.env.MAIL_FROM;

    if (!adminEmail) {
      this.logger.warn('ADMIN_ORDER_EMAIL en MAIL_FROM ontbreken; depannagemail niet verstuurd.');
      return;
    }

    return this.requireClient().sendEmail({
      From: process.env.MAIL_FROM!,
      To: adminEmail,
      ReplyTo: request.email,
      Subject: `Nieuwe depannageaanvraag - ${this.escape(request.name)}`,
      HtmlBody: this.buildDepannageHtml(request),
      TextBody: this.buildDepannageText(request),
      MessageStream: 'outbound',
    });
  }

  private sendEmail(options: {
    to: string;
    subject: string;
    title: string;
    intro: string;
    order: MailOrder;
    footer: string;
    includeCustomerBlock?: boolean;
  }) {
    return this.requireClient().sendEmail({
      From: process.env.MAIL_FROM!,
      To: options.to,
      Subject: options.subject,
      HtmlBody: this.buildHtml(options),
      TextBody: this.buildText(options),
      MessageStream: 'outbound',
    });
  }

  private buildHtml(options: {
    title: string;
    intro: string;
    order: MailOrder;
    footer: string;
    includeCustomerBlock?: boolean;
  }): string {
    const order = options.order;
    const items = order.items
      .map(
        (item) => `
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid #e5e9f0;">${this.escape(item.name)}</td>
            <td style="padding:12px 0;border-bottom:1px solid #e5e9f0;text-align:center;">${item.quantity}</td>
            <td style="padding:12px 0;border-bottom:1px solid #e5e9f0;text-align:right;">${this.formatPrice(item.price)}</td>
          </tr>
        `,
      )
      .join('');

    return `
      <div style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;color:#182033;">
        <div style="max-width:680px;margin:0 auto;padding:28px 16px;">
          <div style="background:#11182f;color:#fff;border-radius:8px 8px 0 0;padding:24px;">
            <div style="font-size:22px;font-weight:800;letter-spacing:.04em;">Eeckeleers &amp; Zonen</div>
            <div style="margin-top:6px;color:#b8bec8;text-transform:uppercase;letter-spacing:.18em;font-size:12px;">Truckparts &amp; Services</div>
          </div>

          <div style="background:#fff;border:1px solid #d8dee8;border-top:0;border-radius:0 0 8px 8px;padding:28px;">
            <h1 style="margin:0 0 12px;color:#11182f;font-size:28px;line-height:1.15;">${this.escape(options.title)}</h1>
            <p style="margin:0 0 22px;color:#536073;font-size:16px;line-height:1.6;">${options.intro}</p>

            ${options.includeCustomerBlock ? this.customerBlock(order) : ''}

            <div style="margin:22px 0;padding:16px;border-radius:8px;background:#f4f6f9;">
              <div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:8px;">
                <strong>Order</strong>
                <span>${this.escape(order.id)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:8px;">
                <strong>Status</strong>
                <span>${this.escape(order.status)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;gap:16px;">
                <strong>Totaal</strong>
                <span style="color:#0067b1;font-weight:800;">${this.formatPrice(order.totalPrice)}</span>
              </div>
            </div>

            <h2 style="margin:26px 0 8px;color:#11182f;font-size:18px;">Bestelde items</h2>
            <table role="presentation" style="width:100%;border-collapse:collapse;">
              <thead>
                <tr>
                  <th align="left" style="padding:10px 0;border-bottom:2px solid #11182f;color:#11182f;">Item</th>
                  <th align="center" style="padding:10px 0;border-bottom:2px solid #11182f;color:#11182f;">Aantal</th>
                  <th align="right" style="padding:10px 0;border-bottom:2px solid #11182f;color:#11182f;">Prijs</th>
                </tr>
              </thead>
              <tbody>${items}</tbody>
            </table>

            <p style="margin:28px 0 0;color:#536073;line-height:1.6;">${this.escape(options.footer)}</p>
          </div>
        </div>
      </div>
    `;
  }

  private customerBlock(order: MailOrder): string {
    return `
      <div style="margin:22px 0;padding:16px;border:1px solid #d8dee8;border-radius:8px;">
        <h2 style="margin:0 0 10px;color:#11182f;font-size:18px;">Klantgegevens</h2>
        <p style="margin:0;color:#536073;line-height:1.6;">
          ${this.escape(order.customerName)}<br>
          ${this.escape(order.email)}${order.phone ? `<br>${this.escape(order.phone)}` : ''}<br>
          ${this.escape(order.address)}<br>
          ${this.escape(order.postalCode)} ${this.escape(order.city)}<br>
          ${this.escape(order.country)}
        </p>
      </div>
    `;
  }

  private buildText(options: {
    title: string;
    intro: string;
    order: MailOrder;
    footer: string;
    includeCustomerBlock?: boolean;
  }): string {
    const order = options.order;
    const customer = options.includeCustomerBlock
      ? `
Klant:
${order.customerName}
${order.email}
${order.phone ?? ''}
${order.address}
${order.postalCode} ${order.city}
${order.country}
`
      : '';

    return `
${options.title}

${this.stripHtml(options.intro)}
${customer}
Order ID: ${order.id}
Status: ${order.status}
Totaal: ${this.formatPrice(order.totalPrice)}

Items:
${order.items.map((item) => `- ${item.name} x${item.quantity} - ${this.formatPrice(item.price)}`).join('\n')}

${options.footer}
    `.trim();
  }

  private buildDepannageHtml(request: DepannageRequest): string {
    const rows = [
      ['Naam', request.name],
      ['Bedrijf', request.company || '-'],
      ['E-mail', request.email],
      ['Telefoon', request.phone],
      ['Locatie vrachtwagen', request.location],
      ['Vrachtwagen', request.vehicleInfo],
      ['Dringendheid', request.urgency],
      ['Bericht', request.message || '-'],
    ]
      .map(
        ([label, value]) => `
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid #e5e9f0;color:#536073;">${this.escape(label)}</td>
            <td style="padding:12px 0;border-bottom:1px solid #e5e9f0;font-weight:700;color:#11182f;">${this.escape(value)}</td>
          </tr>
        `,
      )
      .join('');

    return `
      <div style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;color:#182033;">
        <div style="max-width:680px;margin:0 auto;padding:28px 16px;">
          <div style="background:#11182f;color:#fff;border-radius:8px 8px 0 0;padding:24px;">
            <div style="font-size:22px;font-weight:800;letter-spacing:.04em;">EZ-Trucks</div>
            <div style="margin-top:6px;color:#b8bec8;text-transform:uppercase;letter-spacing:.18em;font-size:12px;">Depannage vrachtwagens</div>
          </div>
          <div style="background:#fff;border:1px solid #d8dee8;border-top:0;border-radius:0 0 8px 8px;padding:28px;">
            <h1 style="margin:0 0 12px;color:#11182f;font-size:28px;line-height:1.15;">Nieuwe depannageaanvraag</h1>
            <p style="margin:0 0 22px;color:#536073;font-size:16px;line-height:1.6;">
              Er is een nieuwe aanvraag binnengekomen via de EZ-Trucks website. Antwoord rechtstreeks op deze mail om de klant te contacteren.
            </p>
            <table role="presentation" style="width:100%;border-collapse:collapse;">${rows}</table>
          </div>
        </div>
      </div>
    `;
  }

  private buildDepannageText(request: DepannageRequest): string {
    return `
Nieuwe depannageaanvraag

Naam: ${request.name}
Bedrijf: ${request.company || '-'}
E-mail: ${request.email}
Telefoon: ${request.phone}
Locatie vrachtwagen: ${request.location}
Vrachtwagen: ${request.vehicleInfo}
Dringendheid: ${request.urgency}
Bericht: ${request.message || '-'}
    `.trim();
  }

  private formatPrice(value: number): string {
    return new Intl.NumberFormat('nl-BE', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
  }

  private shortOrderId(id: string): string {
    return id.slice(0, 8).toUpperCase();
  }

  private escape(value: string): string {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private stripHtml(value: string): string {
    return value.replace(/<[^>]*>/g, '');
  }
}
