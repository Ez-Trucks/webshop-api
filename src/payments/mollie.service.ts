import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import createMollieClient from '@mollie/api-client';

@Injectable()
export class MollieService {
  private mollieClient;
  private readonly frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:4200';
  private readonly apiPublicUrl = process.env.API_PUBLIC_URL;
  private readonly mollieWebhookUrl = process.env.MOLLIE_WEBHOOK_URL;

  constructor() {
    const apiKey = process.env.MOLLIE_API_KEY;

    this.mollieClient = apiKey ? createMollieClient({ apiKey }) : null;
  }

  private requireClient() {
    if (!this.mollieClient) throw new ServiceUnavailableException('Online betalingen zijn nog niet ingesteld.');
    return this.mollieClient;
  }

  async createPayment(orderId: string, amount: number) {
    const redirectUrl = new URL('/payment-success', this.frontendUrl);
    redirectUrl.searchParams.set('orderId', orderId);

    const webhookUrl =
      this.mollieWebhookUrl ||
      (this.apiPublicUrl ? new URL('/payments/webhook', this.apiPublicUrl).toString() : undefined);

    if (!webhookUrl) {
      throw new Error('API_PUBLIC_URL of MOLLIE_WEBHOOK_URL is niet ingesteld in .env');
    }

    const payment = await this.requireClient().payments.create({
      amount: {
        currency: 'EUR',
        value: amount.toFixed(2),
      },
      description: `Order ${orderId}`,
      redirectUrl: redirectUrl.toString(),
      webhookUrl,
      metadata: {
        orderId,
      },
    });

    return payment;
  }

  async getPayment(paymentId: string) {
    return this.requireClient().payments.get(paymentId);
  }
}
