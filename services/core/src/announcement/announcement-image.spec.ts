import sharp = require('sharp');
import { BadRequestException } from '@nestjs/common';
import { prepareAnnouncementImage } from './announcement-image';

const toMulterFile = (
  buffer: Buffer,
  originalname: string,
): Express.Multer.File =>
  ({ buffer, originalname, size: buffer.length } as Express.Multer.File);

const solidImage = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#335' } })
    .png()
    .toBuffer();

describe('prepareAnnouncementImage', () => {
  it('shrinks a portrait poster to a 1600px long edge as JPEG', async () => {
    const out = await prepareAnnouncementImage(
      toMulterFile(await solidImage(2184, 2880), 'poster.png'),
    );
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('jpeg');
    expect([meta.width, meta.height]).toEqual([1213, 1600]);
  });

  it('keeps the size of a small image', async () => {
    const out = await prepareAnnouncementImage(
      toMulterFile(await solidImage(1092, 1440), 'poster.png'),
    );
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([1092, 1440]);
  });

  it('rejects a file that is not an image', async () => {
    await expect(
      prepareAnnouncementImage(toMulterFile(Buffer.from('nope'), 'x.txt')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
