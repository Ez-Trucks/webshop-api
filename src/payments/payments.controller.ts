import { Body, Controller, Post } from '@nestjs/common';
import { MollieService } from './mollie.service';
import { OrdersService } from '../orders/orders.service';
import { MailService } from '../mail/mail.service';


@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly mollieService: MollieService,
    private readonly ordersService: OrdersService,
    private readonly mailService:MailService,
  ) {}

  @Post('create')
  async createPayment(@Body() body: { orderId: string; amount: number }) {
    const payment = await this.mollieService.createPayment(
      body.orderId,
      body.amount,
    );

    return {
      checkoutUrl: payment.getCheckoutUrl(),
    };
  }
  @Post('webhook')
  async handleWebhook(@Body() body: any) {
    console.log('Webhook body ontvangen:', body);

    const paymentId = body?.id;

    if (!paymentId) {
      console.log('Geen payment id ontvangen in webhook body');
      return { ok: false, reason: 'no_payment_id' };
    }

    const payment = await this.mollieService.getPayment(paymentId);

    console.log('Payment opgehaald bij Mollie:', {
      id: payment.id,
      status: payment.status,
      metadata: payment.metadata,
    });

    const orderId = payment.metadata?.orderId as string | undefined;

    if (!orderId) {
      console.log('Geen orderId gevonden in payment metadata');
      return { ok: false, reason: 'no_order_id' };
    }

    if (payment.status === 'paid') {
      console.log(`Order ${orderId} wordt op paid gezet`);
      await this.ordersService.markAsPaid(orderId);

      const order = await this.ordersService.findOne(orderId);
      await this.mailService.sendOrderConfirmation(order.email, order);
      await this.mailService.sendAdminPaidOrderNotification(order);

      console.log(`Bevestigingsmail en adminmail verstuurd voor order ${orderId}`);
    } else {
      console.log(`Payment nog niet paid, status = ${payment.status}`);
    }

    return { ok: true };
  }
}
