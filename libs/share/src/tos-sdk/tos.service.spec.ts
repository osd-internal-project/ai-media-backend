import { createHmac } from 'crypto';
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
  describe('createPostPolicy', () => {
    beforeEach(() => {
      process.env.TOS_ACCESS_KEY = 'AK';
      process.env.TOS_SECRET_KEY = 'SK';
      process.env.TOS_REGION = 'ap-southeast-3';
      process.env.TOS_ENDPOINT = 'tos-ap-southeast-3.bytepluses.com';
      process.env.TOS_BUCKET = 'bucket';
    });

    const decode = (policy: string) =>
      JSON.parse(Buffer.from(policy, 'base64').toString()) as {
        conditions: unknown[];
      };

    it('scopes the policy to a key prefix, size and type — without pinning one key', () => {
      const { url, fields } = new TosService().createPostPolicy({
        keyPrefix: 'organize/o/p/upload/',
        contentTypePrefix: 'image/',
        maxBytes: 500,
        expiresSec: 3600,
      });
      expect(url).toBe('https://bucket.tos-ap-southeast-3.bytepluses.com');
      const { conditions } = decode(fields.policy);
      expect(conditions).toEqual(
        expect.arrayContaining([
          { bucket: 'bucket' },
          ['starts-with', '$key', 'organize/o/p/upload/'],
          ['content-length-range', 1, 500],
          ['starts-with', '$Content-Type', 'image/'],
        ]),
      );
      expect(conditions).not.toContainEqual(
        expect.objectContaining({ key: expect.anything() }),
      );
    });

    it('signs the policy with the TOS4 derived key', () => {
      const { fields } = new TosService().createPostPolicy({
        keyPrefix: 'k/',
        contentTypePrefix: 'image/',
        maxBytes: 1,
        expiresSec: 60,
      });
      const date8 = fields['x-tos-date'].slice(0, 8);
      const h = (k: string | Buffer, d: string) =>
        createHmac('sha256', k).update(d).digest();
      const key = h(h(h(h('SK', date8), 'ap-southeast-3'), 'tos'), 'request');
      expect(fields['x-tos-signature']).toBe(
        createHmac('sha256', key).update(fields.policy).digest('hex'),
      );
      expect(fields['x-tos-credential']).toBe(
        `AK/${date8}/ap-southeast-3/tos/request`,
      );
    });

    it('pins the callback in the policy and lets the browser add per-file vars', () => {
      const { fields } = new TosService().createPostPolicy({
        keyPrefix: 'k/',
        contentTypePrefix: 'image/',
        maxBytes: 1,
        expiresSec: 60,
        callback: { url: 'https://w/upload/callback', body: '{"key":${object}}' },
      });
      const cb = JSON.parse(
        Buffer.from(fields['x-tos-callback'], 'base64').toString(),
      );
      expect(cb).toEqual({
        callbackUrl: 'https://w/upload/callback',
        callbackBody: '{"key":${object}}',
        callbackBodyType: 'application/json',
      });
      const { conditions } = decode(fields.policy);
      expect(conditions).toContainEqual({
        'x-tos-callback': fields['x-tos-callback'],
      });
      expect(conditions).toContainEqual([
        'starts-with',
        '$x-tos-callback-var',
        '',
      ]);
    });
  });
});
