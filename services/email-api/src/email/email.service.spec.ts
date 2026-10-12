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
