import sharp = require('sharp');
import { preparePhoto } from './photo-event-image';
import { PHOTO_EVENT_MAX_IMAGE_EDGE } from './photo-event.constants';

const toMulterFile = (
  buffer: Buffer,
  originalname: string,
  mimetype: string,
): Express.Multer.File =>
  ({
    buffer,
    originalname,
    mimetype,
    size: buffer.length,
  } as Express.Multer.File);

const solidImage = (width: number, height: number) =>
  sharp({
    create: { width, height, channels: 3, background: '#7a5' },
  })
    .png()
    .toBuffer();

describe('preparePhoto', () => {
  it('shrinks the long edge to PHOTO_EVENT_MAX_IMAGE_EDGE as JPEG', async () => {
    const file = toMulterFile(
      await solidImage(6000, 4000),
      'big.png',
      'image/png',
    );
    const prepared = await preparePhoto(file);
    const meta = await sharp(prepared.buffer).metadata();
    expect(prepared.converted).toBe(true);
    expect(prepared.mimetype).toBe('image/jpeg');
    expect(prepared.extension).toBe('.jpg');
    expect(meta.width).toBe(PHOTO_EVENT_MAX_IMAGE_EDGE);
    expect(meta.height).toBe(
      Math.round((4000 / 6000) * PHOTO_EVENT_MAX_IMAGE_EDGE),
    );
  });

  it('keeps the size of a small photo', async () => {
    const file = toMulterFile(
      await solidImage(800, 600),
      'small.png',
      'image/png',
    );
    const meta = await sharp((await preparePhoto(file)).buffer).metadata();
    expect([meta.width, meta.height]).toEqual([800, 600]);
  });

  it('returns the original bytes when the image cannot be decoded', async () => {
    const buffer = Buffer.from('not an image');
    const prepared = await preparePhoto(
      toMulterFile(buffer, 'x.HEIC', 'image/heic'),
    );
    expect(prepared).toEqual({
      buffer,
      extension: '.heic',
      mimetype: 'image/heic',
      converted: false,
    });
  });
});
