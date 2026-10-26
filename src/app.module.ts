import { OperationsController } from './operations/operations.controller';
import { AdAssistantModule } from './ad-assistant/ad-assistant.module';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PartsModule } from './parts/parts.module';
import { PrismaModule } from './prisma/prisma.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { MailModule } from './mail/mail.module';
import { AuthModule } from './auth/auth.module';
import { InquiriesModule } from './inquiries/inquiries.module';

@Module({
  imports: [AdAssistantModule, AuthModule, PartsModule, PrismaModule, OrdersModule, PaymentsModule, MailModule, InquiriesModule],
  controllers: [AppController, OperationsController],
  providers: [AppService],
})
export class AppModule {}
