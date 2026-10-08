import { Readable } from 'stream';
import { TosClient } from '@volcengine/tos-sdk';
import { IMMUTABLE_CACHE_CONTROL, TosService } from './tos.service';

jest.mock('@volcengine/tos-sdk', () => {
  const actual = jest.requireActual('@volcengine/tos-sdk');
  return { ...actual, TosClient: jest.fn() };
});

const TosClientMock = TosClient as unknown as jest.Mock;

describe('TosService', () => {
  let client: Record<string, jest.Mock>;

  beforeEach(() => {
    client = {
      putObject: jest.fn().mockResolvedValue({ data: { ETag: '"etag"' } }),
      headObject: jest.fn(),
      getObjectV2: jest.fn(),
      getPreSignedUrl: jest.fn().mockReturnValue('https://signed'),
    };
    TosClientMock.mockReset();
    TosClientMock.mockImplementation(() => client);
  });

  afterEach(() => {
    delete process.env.TOS_MAX_RETRY_COUNT;
  });

  it('passes numeric env overrides to the client and leaves unset ones undefined', () => {
    process.env.TOS_MAX_RETRY_COUNT = '5';
    new TosService();
    const opts = TosClientMock.mock.calls[0][0];
    expect(opts.maxRetryCount).toBe(5);
    expect(opts.maxConnections).toBeUndefined();
  });

  it('putObject forwards headers and skips the extra headObject round trip', async () => {
    const service = new TosService();
    const result = await service.putObject('b', 'k', Buffer.from('x'), {
      contentType: 'image/png',
      cacheControl: IMMUTABLE_CACHE_CONTROL,
    });
    expect(client.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'b',
        key: 'k',
        contentType: 'image/png',
        cacheControl: IMMUTABLE_CACHE_CONTROL,
      }),
    );
    expect(client.headObject).not.toHaveBeenCalled();
    expect(result).toEqual({ ETag: '"etag"' });
  });

  it('getObjectV2 joins all stream chunks in order', async () => {
    client.getObjectV2.mockResolvedValue({
      data: { content: Readable.from([Buffer.from('ab'), Buffer.from('cd')]) },
    });
    const service = new TosService();
    const body = await service.getObjectV2('b', 'k');
    expect(body?.toString()).toBe('abcd');
  });

  it('getPreSignedPutUrl signs a PUT for the key', () => {
    const service = new TosService();
    expect(service.getPreSignedPutUrl('b', 'k', 600)).toBe('https://signed');
    expect(client.getPreSignedUrl).toHaveBeenCalledWith({
      method: 'PUT',
      bucket: 'b',
      key: 'k',
      expires: 600,
    });
  });

  it('getPreSignedPutUrl rethrows signing errors', () => {
    client.getPreSignedUrl.mockImplementation(() => {
      throw new Error('bad key');
    });
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const service = new TosService();
    expect(() => service.getPreSignedPutUrl('b', 'k')).toThrow('bad key');
  });
});
