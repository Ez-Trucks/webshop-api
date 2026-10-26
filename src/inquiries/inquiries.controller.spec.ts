import { InquiriesController } from './inquiries.controller';
import { Logger } from '@nestjs/common';

describe('Depannageaanvragen', () => {
  const dto = { name: 'Test', email: 'test@example.invalid', phone: '0123456789', location: 'Testlocatie', vehicleInfo: 'DAF', urgency: 'Deze week' };
  afterEach(() => jest.restoreAllMocks());
  it('bevestigt een opgeslagen aanvraag ook wanneer de e-maildienst uitvalt', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const inquiries = { createDepannage: jest.fn().mockResolvedValue({ id: 'stored' }) };
    const mail = { sendDepannageRequest: jest.fn().mockRejectedValue(new Error('offline')) };
    const result = await new InquiriesController(inquiries as any, mail as any).createDepannageInquiry(dto);
    expect(result).toMatchObject({ ok: true, inquiryId: 'stored', notificationSent: false });
    expect(inquiries.createDepannage).toHaveBeenCalledTimes(1);
  });
  it('verstuurt geen e-mail wanneer de database niets heeft opgeslagen', async () => {
    const inquiries = { createDepannage: jest.fn().mockRejectedValue(new Error('offline')) };
    const mail = { sendDepannageRequest: jest.fn() };
    await expect(new InquiriesController(inquiries as any, mail as any).createDepannageInquiry(dto)).rejects.toThrow('offline');
    expect(mail.sendDepannageRequest).not.toHaveBeenCalled();
  });
});
