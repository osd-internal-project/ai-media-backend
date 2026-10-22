import { BadRequestException, NotFoundException } from '@nestjs/common';
import sharp = require('sharp');
import { parsePrintLayout } from './photo-event-print-layout';
import { PhotoEventPrintService } from './photo-event-print.service';

jest.mock('../configs', () => ({
  tosConfigs: () => ({ tosBucket: 'bucket' }),
}));

const PREFIX = 'organize/org/proj/upload/';

const validLayout = () => ({
  version: 1,
  paper: { widthMm: 102, heightMm: 152, bleedMm: 2, marginMm: 5 },
  background: { color: '#ffffff', fit: 'cover', imageKey: `${PREFIX}bg.png` },
  elements: [
    {
      id: 'photo',
      type: 'photo',
      xMm: 5,
      yMm: 5,
      wMm: 92,
      hMm: 112,
      fit: 'cover',
      focusX: 50,
      focusY: 40,
    },
    {
      id: 'qr',
      type: 'qr',
      xMm: 5,
      yMm: 121,
      wMm: 26,
      hMm: 26,
      color: '#000000',
      bgColor: '#ffffff',
    },
    {
      id: 'logo',
      type: 'icon',
      xMm: 80,
      yMm: 125,
      wMm: 15,
      hMm: 15,
      assetKey: `${PREFIX}logo.png`,
    },
    { id: 'frame', type: 'overlay', assetKey: `${PREFIX}frame.png` },
  ],
});

describe('parsePrintLayout', () => {
  it('keeps a valid layout and drops unknown fields', () => {
    const input = { ...validLayout(), extra: '<script>' };
    const parsed = parsePrintLayout(input, PREFIX);
    expect(parsed).toEqual(validLayout());
  });

  it('rejects an asset key from another project', () => {
    const layout = validLayout();
    layout.background.imageKey = 'organize/other-org/x/upload/bg.png';
    expect(() => parsePrintLayout(layout, PREFIX)).toThrow(
      'background.imageKey must be an asset uploaded to this project',
    );
  });

  it('rejects path traversal inside the project prefix', () => {
    const layout = validLayout();
    const traversal = {
      id: 'f',
      type: 'overlay',
      assetKey: `${PREFIX}../../x`,
    };
    const input = { ...layout, elements: [traversal] };
    expect(() => parsePrintLayout(input, PREFIX)).toThrow(BadRequestException);
  });

  it('names the bad field when a number is out of range', () => {
    const layout = validLayout();
    layout.paper.widthMm = 5;
    expect(() => parsePrintLayout(layout, PREFIX)).toThrow(
      'paper.widthMm must be a number between 20 and 500',
    );
  });

  it('rejects an unknown element type', () => {
    const layout = { ...validLayout(), elements: [{ id: 'x', type: 'video' }] };
    expect(() => parsePrintLayout(layout, PREFIX)).toThrow(
      'elements[0].type must be one of photo, qr, icon, text, overlay',
    );
  });
});

describe('PhotoEventPrintService', () => {
  let repo: Record<string, jest.Mock>;
  let tos: { putObject: jest.Mock };
  let service: PhotoEventPrintService;

  beforeEach(() => {
    repo = {
      findMany: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(async ({ data }) => ({ id: 't1', ...data })),
      update: jest.fn(async ({ where, data }) => ({
        id: where.id,
        name: 'n',
        layout: validLayout(),
        ...data,
      })),
      updateMany: jest.fn(),
      delete: jest.fn(),
    };
    tos = { putObject: jest.fn() };
    service = new PhotoEventPrintService(
      repo as never,
      tos as never,
      {
        toDisplayUrl: jest.fn(async (key: string) => `https://cdn/${key}`),
      } as never,
      { execute: jest.fn((fn) => fn('tx')) } as never,
      {
        findActiveProject: jest
          .fn()
          .mockResolvedValue({ organizationId: 'org' }),
        ensurePermission: jest.fn(),
      } as never,
    );
  });

  it('makes the first template of a project active and presigns its assets', async () => {
    repo.findOne.mockResolvedValue(null);
    const view = await service.create('proj', {
      userId: 'u1',
      name: ' Wedding ',
      layout: validLayout(),
    });
    expect(view.isActive).toBe(true);
    expect(view.name).toBe('Wedding');
    expect(view.assetUrls).toEqual({
      [`${PREFIX}logo.png`]: `https://cdn/${PREFIX}logo.png`,
      [`${PREFIX}frame.png`]: `https://cdn/${PREFIX}frame.png`,
      [`${PREFIX}bg.png`]: `https://cdn/${PREFIX}bg.png`,
    });
  });

  it('leaves later templates inactive', async () => {
    repo.findOne.mockResolvedValue({ id: 'existing' });
    const view = await service.create('proj', {
      userId: 'u1',
      name: 'B',
      layout: validLayout(),
    });
    expect(view.isActive).toBe(false);
  });

  it('deactivates the other templates in the same transaction when activating', async () => {
    repo.findOne.mockResolvedValue({ id: 't2', projectId: 'proj' });
    const view = await service.activate('proj', 't2', 'u1');
    expect(repo.updateMany).toHaveBeenCalledWith(
      {
        where: { projectId: 'proj', isActive: true },
        data: { isActive: false },
      },
      { prisma: 'tx' },
    );
    expect(repo.update).toHaveBeenCalledWith(
      { where: { id: 't2' }, data: { isActive: true } },
      { prisma: 'tx' },
    );
    expect(view.isActive).toBe(true);
  });

  it('does not activate a template of another project', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(
      service.activate('proj', 'foreign', 'u1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.updateMany).not.toHaveBeenCalled();
  });

  it('stores uploaded assets as PNG and keeps transparency', async () => {
    const transparent = await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .webp()
      .toBuffer();
    const asset = await service.uploadAsset('proj', 'u1', {
      buffer: transparent,
      originalname: 'logo.webp',
      mimetype: 'image/webp',
    } as Express.Multer.File);

    expect(asset.key).toMatch(/^organize\/org\/proj\/upload\/.+\.png$/);
    const stored: Buffer = tos.putObject.mock.calls[0][2];
    const meta = await sharp(stored).metadata();
    expect(meta.format).toBe('png');
    expect(meta.hasAlpha).toBe(true);
  });

  it('rejects a file that is not an image', async () => {
    await expect(
      service.uploadAsset('proj', 'u1', {
        buffer: Buffer.from('not an image'),
        originalname: 'x.png',
        mimetype: 'image/png',
      } as Express.Multer.File),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tos.putObject).not.toHaveBeenCalled();
  });
});
