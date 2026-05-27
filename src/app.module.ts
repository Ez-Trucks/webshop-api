import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PartsModule } from './parts/parts.module';
import { PrismaModule } from './prisma/prisma.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { MailModule } from './mail/mail.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [AuthModule, PartsModule, PrismaModule, OrdersModule, PaymentsModule, MailModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
