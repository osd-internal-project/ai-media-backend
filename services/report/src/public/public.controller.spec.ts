import { NotFoundException } from '@nestjs/common';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PassThrough } from 'stream';

const uploadDir = mkdtempSync(join(tmpdir(), 'report-public-'));
mkdirSync(join(uploadDir, 'generate-images'));
writeFileSync(join(uploadDir, 'generate-images', 'ok.jpg'), 'jpeg-bytes');

jest.mock(
  'src/configs',
  () => ({
    __esModule: true,
    default: () => ({ pathMountDirUpload: uploadDir }),
  }),
  { virtual: true },
);

// import หลัง mock — controller อ่าน configs ตอนโหลด module
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PublicController } = require('./public.controller');

/** Response ปลอมที่ pipe ได้ — เก็บ status / body ไว้ตรวจ */
const fakeRes = () => {
  const res = new PassThrough() as PassThrough & Record<string, unknown>;
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.headersSent = false;
  res.statusCode = 200;
  res.set = jest.fn();
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.body = () => Buffer.concat(chunks).toString();
  return res;
};

const settle = (res: PassThrough) =>
  new Promise((resolve) => res.on('finish', resolve));

describe('PublicController.getNewsImageFile', () => {
  const controller = new PublicController();

  it.each(['../../etc/passwd', '../secret.jpg', '..', 'a/b.jpg'])(
    'rejects path traversal: %s',
    (id) => {
      expect(() => controller.getNewsImageFile(id, fakeRes())).toThrow(
        NotFoundException,
      );
    },
  );

  it('streams an existing file', async () => {
    const res = fakeRes();
    controller.getNewsImageFile('ok.jpg', res);
    await settle(res);
    expect((res.body as () => string)()).toBe('jpeg-bytes');
  });

  it('missing file → 404 instead of an unhandled stream error', async () => {
    const res = fakeRes();
    controller.getNewsImageFile('missing.jpg', res);
    await settle(res);
    expect(res.statusCode).toBe(404);
  });
});
