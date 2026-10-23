import { ValidationPipe } from '@nestjs/common';
import { SaveAnnouncementDto } from './save-announcement.dto';

// pipe เดียวกับ main.ts — multipart ส่งทุก field มาเป็น string
const pipe = new ValidationPipe({ transform: true, whitelist: true });
const parse = (body: Record<string, string>) =>
  pipe.transform(body, { type: 'body', metatype: SaveAnnouncementDto });

describe('SaveAnnouncementDto', () => {
  it('converts multipart strings to number and boolean', async () => {
    const dto = await parse({
      category: 'PROMOTION',
      title: 'Poster',
      sortOrder: '2',
      isActive: 'false',
      removeImage: 'true',
    });
    expect(dto).toMatchObject({
      sortOrder: 2,
      isActive: false,
      removeImage: true,
    });
  });

  it.each([
    [{ category: 'NEWS', title: 'x' }],
    [{ category: 'PROMOTION', title: '' }],
    [{ category: 'PROMOTION', title: 'x'.repeat(151) }],
  ])('rejects %j with 400', async (body) => {
    await expect(parse(body)).rejects.toMatchObject({ status: 400 });
  });
});
