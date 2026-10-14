import { BadRequestException } from '@nestjs/common';
import sharp = require('sharp');
import { PhotoEventPhotosService } from './photo-event-photos.service';

jest.mock('../configs', () => ({ tosConfigs: () => ({ tosBucket: 'bucket' }) }));
jest.mock('../websocket/websocket.gateway', () => ({
  WebsocketGatewayService: class {},
}));

const file = (buffer: Buffer, originalname: string, mimetype: string) =>
  ({ buffer, originalname, mimetype, size: buffer.length } as Express.Multer.File);

const realPng = () =>
  sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } })
    .png()
    .toBuffer();

describe('PhotoEventPhotosService.upload (fake images)', () => {
  let tos: { putObject: jest.Mock };
  let service: PhotoEventPhotosService;

  beforeEach(() => {
    tos = { putObject: jest.fn() };
    service = new PhotoEventPhotosService(
      { create: jest.fn(async ({ data }) => ({ id: 'p1', ...data })) } as never,
      tos as never,
      { emitToRoom: jest.fn() } as never,
      {
        findActiveProject: jest.fn().mockResolvedValue({ organizationId: 'org' }),
        ensurePermission: jest.fn(),
      } as never,
      { toPhotoBase: jest.fn(async (photo) => photo) } as never,
    );
  });

  it('does not store a file that only claims to be image/png', async () => {
    const html = file(Buffer.from('<html><script>x</script></html>'), 'x.png', 'image/png');
    await expect(
      service.upload('proj', { userId: 'u1' } as never, [html]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tos.putObject).not.toHaveBeenCalled();
  });

  it('keeps real images and skips fake ones in the same batch', async () => {
    const real = file(await realPng(), 'a.png', 'image/png');
    const fake = file(Buffer.from('not an image'), 'b.png', 'image/png');
    const created = await service.upload('proj', { userId: 'u1' } as never, [
      real,
      fake,
    ]);
    expect(created).toHaveLength(1);
    expect(tos.putObject).toHaveBeenCalledTimes(1);
  });
});
