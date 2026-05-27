import { Module } from '@nestjs/common';
import { MollieService } from './mollie.service';
import { PaymentsController } from './payments.controller';
import { OrdersModule } from '../orders/orders.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [OrdersModule, MailModule],
  controllers: [PaymentsController],
  providers: [MollieService],
})
export class PaymentsModule {}