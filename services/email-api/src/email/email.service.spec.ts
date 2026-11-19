import { HttpException, HttpStatus } from '@nestjs/common';
import { EmailService } from './email.service';

type RenderBody = (dto: { template?: string; context?: object }) => string;

describe('EmailService.renderBody template name', () => {
  // renderBody เป็น private — เรียกผ่าน cast เพื่อทดสอบการกัน path traversal ตรง ๆ
  const renderBody = (template: string) =>
    (new EmailService() as unknown as { renderBody: RenderBody }).renderBody({
      template,
    });

  it.each(['../../etc/passwd', '../templates/invite', 'a/b', 'Invite.hbs', ''])(
    'rejects %p with 400',
    (template) => {
      try {
        renderBody(template);
        throw new Error('expected rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(
          HttpStatus.BAD_REQUEST,
        );
      }
    },
  );

  it('accepts a plain template name (fails only because the file is not built)', () => {
    try {
      renderBody('does-not-exist');
      throw new Error('expected missing-file error');
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  });
});

describe('EmailService.sendMail retry', () => {
  const smtpError = (responseCode: number) =>
    Object.assign(new Error(`${responseCode} smtp`), { responseCode });

  const serviceWith = (sendMail: jest.Mock) => {
    const service = new EmailService();
    Object.assign(service as unknown as object, {
      transporter: { sendMail },
      retryDelaysMs: [0, 0],
    });
    return service;
  };
  const dto = { to: 'a@b.co', subject: 's', html: '<p/>' };
  const ok = { messageId: 'm1', response: '250 ok', rejected: [] };

  it('retries 421/451 and then succeeds', async () => {
    const sendMail = jest
      .fn()
      .mockRejectedValueOnce(smtpError(421))
      .mockRejectedValueOnce(smtpError(451))
      .mockResolvedValueOnce(ok);
    await expect(serviceWith(sendMail).sendMail(dto)).resolves.toEqual({
      success: true,
      messageId: 'm1',
    });
    expect(sendMail).toHaveBeenCalledTimes(3);
  });

  it('gives up after the last retry on 4xx', async () => {
    const sendMail = jest.fn().mockRejectedValue(smtpError(451));
    await expect(serviceWith(sendMail).sendMail(dto)).resolves.toEqual({
      success: false,
      error: '451 smtp',
    });
    expect(sendMail).toHaveBeenCalledTimes(3);
  });

  it('does not retry 5xx', async () => {
    const sendMail = jest.fn().mockRejectedValue(smtpError(550));
    await expect(serviceWith(sendMail).sendMail(dto)).resolves.toMatchObject({
      success: false,
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});
