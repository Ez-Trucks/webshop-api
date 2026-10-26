import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdAssistantController } from './ad-assistant.controller';
import { AdAssistantService } from './ad-assistant.service';
import { AdAiService } from './ad-ai.service';
@Module({ imports: [PrismaModule], controllers: [AdAssistantController], providers: [AdAssistantService, AdAiService] })
export class AdAssistantModule {}
