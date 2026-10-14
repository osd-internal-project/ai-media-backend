import { TosService } from '../tos-sdk';
import { StorageUrlService } from './storage-url.service';

describe('StorageUrlService presign cache', () => {
  let presign: jest.Mock;
  let service: StorageUrlService;
  let counter: number;

  beforeEach(() => {
    process.env.TOS_BUCKET = 'bucket';
    counter = 0;
    presign = jest.fn(async () => `https://signed/${++counter}`);
    service = new StorageUrlService({
      getPreSignedUrl: presign,
    } as unknown as TosService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the same display URL for repeated calls within the TTL', async () => {
    const a = await service.toDisplayUrl('k.png');
    const b = await service.toDisplayUrl('k.png');
    expect(a).toBe(b);
    expect(presign).toHaveBeenCalledTimes(1);
    expect(presign).toHaveBeenCalledWith('bucket', 'k.png', {
      expires: 6 * 60 * 60,
      process: undefined,
      cacheControl: 'private, max-age=3600',
    });
  });

  it('re-signs after the cache TTL', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-08T00:00:00Z'));
    const a = await service.toDisplayUrl('k.png');
    jest.setSystemTime(new Date('2026-10-08T01:00:01Z'));
    const b = await service.toDisplayUrl('k.png');
    expect(a).not.toBe(b);
    expect(presign).toHaveBeenCalledTimes(2);
  });

  it('caches thumbnails separately from the original', async () => {
    const original = await service.toDisplayUrl('k.png');
    const thumb = await service.toThumbnailUrl('k.png', 480);
    expect(original).not.toBe(thumb);
    expect(presign).toHaveBeenLastCalledWith(
      'bucket',
      'k.png',
      expect.objectContaining({ process: 'image/resize,w_480' }),
    );
  });

  it('provider URLs are always freshly signed', async () => {
    await service.toProviderUrl('k.png');
    await service.toProviderUrl('k.png');
    expect(presign).toHaveBeenCalledTimes(2);
    expect(presign).toHaveBeenCalledWith('bucket', 'k.png');
  });

  it('does not cache failures', async () => {
    presign.mockRejectedValueOnce(new Error('boom'));
    expect(await service.toDisplayUrl('k.png', null)).toBeNull();
    expect(await service.toDisplayUrl('k.png', null)).toBe('https://signed/1');
  });

  it('passes absolute URLs through untouched', async () => {
    expect(await service.toDisplayUrl('https://x/y.png')).toBe('https://x/y.png');
    expect(presign).not.toHaveBeenCalled();
  });
});
