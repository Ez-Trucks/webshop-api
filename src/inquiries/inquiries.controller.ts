import { Body, Controller, Get, Logger, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { MailService } from '../mail/mail.service';
import { CreateDepannageInquiryDto } from './dto/create-depannage-inquiry.dto';
import { InquiriesService } from './inquiries.service';

@Controller('inquiries')
export class InquiriesController {
  private readonly logger = new Logger(InquiriesController.name);
  constructor(
    private readonly inquiriesService: InquiriesService,
    private readonly mailService: MailService,
  ) {}

  @Post('depannage')
  async createDepannageInquiry(@Body() dto: CreateDepannageInquiryDto) {
    const inquiry = await this.inquiriesService.createDepannage(dto);
    let notificationSent = false;
    try {
      await this.mailService.sendDepannageRequest(dto);
      notificationSent = true;
    } catch {
      // The inquiry is safely stored; do not encourage duplicate resubmissions if mail is down.
      this.logger.warn('Depannageaanvraag opgeslagen; e-mailmelding niet verstuurd. Bekijk de aanvraag in de admin.');
    }

    return {
      ok: true,
      message: 'Depannageaanvraag ontvangen.',
      inquiryId: inquiry.id,
      notificationSent,
    };
  }

  @Get('depannage')
  @UseGuards(AuthGuard)
  findDepannageInquiries() {
    return this.inquiriesService.findAllDepannage();
  }
}
