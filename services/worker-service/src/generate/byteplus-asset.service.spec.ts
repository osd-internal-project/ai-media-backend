import axios from 'axios';
import { ByteplusAssetService } from './byteplus-asset.service';

jest.mock('axios');
const axiosPost = axios.post as jest.Mock;
(axios.isAxiosError as unknown as jest.Mock).mockImplementation(
  (e: { isAxiosError?: boolean }) => Boolean(e?.isAxiosError),
);
const oneImage = () => ({
  content: [{ type: 'image_url', image_url: { url: 'u' } }],
});

/** ตอบตาม Action ใน query — statuses = ลำดับ Status ของ GetAsset */
const mockApi = (statuses: string[], failOn?: string) => {
  let assetSeq = 0;
  axiosPost.mockImplementation(async (url: string) => {
    const action = new URL(url).searchParams.get('Action');
    if (action === failOn) throw new Error(`${action} boom`);
    switch (action) {
      case 'CreateAssetGroup':
        return { data: { Result: { Id: 'group-1' } } };
      case 'CreateAsset':
        return { data: { Result: { Id: `asset-${++assetSeq}` } } };
      case 'GetAsset':
        return { data: { Result: { Status: statuses.shift() ?? 'Active' } } };
      default:
        return { data: { Result: {} } };
    }
  });
};
const actions = () =>
  axiosPost.mock.calls.map(([url]) => new URL(url).searchParams.get('Action'));

describe('ByteplusAssetService', () => {
  let service: ByteplusAssetService;

  beforeEach(() => {
    process.env.BYTEPLUS_ACCESS_KEY = 'ak';
    process.env.BYTEPLUS_SECRET_KEY = 'sk';
    axiosPost.mockReset();
    service = new ByteplusAssetService();
    service.pollIntervalMs = 0;
  });

  afterEach(() => {
    delete process.env.BYTEPLUS_ACCESS_KEY;
    delete process.env.BYTEPLUS_SECRET_KEY;
  });

  it('reports 0/N then k/N as each asset turns Active', async () => {
    mockApi(['Active', 'Active', 'Active']);
    const onAssetReady = jest.fn().mockResolvedValue(undefined);
    const payload = {
      content: [1, 2, 3].map((i) => ({
        type: 'image_url',
        image_url: { url: `https://s3/${i}.png` },
      })),
    };
    await service.swapImagesToAssets(payload, 't1', onAssetReady);
    expect(onAssetReady.mock.calls).toEqual([
      [0, 3],
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('swaps every image_url to asset:// and leaves video/audio/text alone', async () => {
    mockApi(['Processing', 'Active', 'Active']);
    const payload = {
      content: [
        { type: 'text', text: 'p' },
        { type: 'image_url', image_url: { url: 'https://s3/a.png' } },
        { type: 'video_url', video_url: { url: 'https://s3/v.mp4' } },
        { type: 'image_url', image_url: { url: 'https://s3/b.png' } },
      ],
    };
    const assets = await service.swapImagesToAssets(payload, 't1');

    expect(assets).toEqual({
      groupId: 'group-1',
      assetIds: expect.arrayContaining(['asset-1', 'asset-2']),
    });
    const urls = payload.content.map(
      (c) => (c as { image_url?: { url: string } }).image_url?.url,
    );
    expect(urls[1]).toMatch(/^asset:\/\/asset-[12]$/);
    expect(urls[3]).toMatch(/^asset:\/\/asset-[12]$/);
    expect(urls[1]).not.toBe(urls[3]);
    expect(payload.content[2]).toEqual({
      type: 'video_url',
      video_url: { url: 'https://s3/v.mp4' },
    });
    const [, body, { headers }] = axiosPost.mock.calls[1];
    expect(JSON.parse(body)).toMatchObject({
      GroupId: 'group-1',
      AssetType: 'Image',
      ProjectName: 'default',
    });
    expect(headers.Authorization).toMatch(
      /^HMAC-SHA256 Credential=ak\/\d{8}\/ap-southeast-1\/ark\/request, SignedHeaders=content-type;host;x-content-sha256;x-date, Signature=[0-9a-f]{64}$/,
    );
  });

  it('no images → no API call', async () => {
    const res = await service.swapImagesToAssets(
      { content: [{ type: 'text' }] },
      't1',
    );
    expect(res).toBeNull();
    expect(axiosPost).not.toHaveBeenCalled();
  });

  it('asset Failed → throws and deletes what it created', async () => {
    mockApi(['Failed']);
    await expect(
      service.swapImagesToAssets(
        { content: [{ type: 'image_url', image_url: { url: 'u' } }] },
        't1',
      ),
    ).rejects.toThrow(
      "Your reference image couldn't be used. Please try a different image.",
    );
    expect(actions()).toEqual([
      'CreateAssetGroup',
      'CreateAsset',
      'GetAsset',
      'DeleteAsset',
      'DeleteAssetGroup',
    ]);
  });

  it('asset never becomes Active → times out', async () => {
    mockApi(Array(100).fill('Processing'));
    service.waitTimeoutMs = 0;
    await expect(
      service.swapImagesToAssets(
        { content: [{ type: 'image_url', image_url: { url: 'u' } }] },
        't1',
      ),
    ).rejects.toThrow(
      'Preparing your reference image took too long. Please try again.',
    );
    expect(actions()).toContain('DeleteAssetGroup');
  });

  it('OpenAPI error in ResponseMetadata → throws with the provider message', async () => {
    axiosPost.mockResolvedValue({
      data: {
        ResponseMetadata: {
          Error: { Code: 'SignatureDoesNotMatch', Message: 'bad sig' },
        },
      },
    });
    await expect(
      service.swapImagesToAssets(
        { content: [{ type: 'image_url', image_url: { url: 'u' } }] },
        't1',
      ),
    ).rejects.toThrow(
      "We couldn't prepare your reference image right now. Please try again later.",
    );
  });

  it('401 InvalidAccessKey → readable message without the key or provider detail', async () => {
    axiosPost.mockRejectedValue({
      isAxiosError: true,
      message: 'Request failed with status code 401',
      response: {
        status: 401,
        data: {
          ResponseMetadata: {
            Error: {
              Code: 'InvalidAccessKey',
              Message:
                'The security token[AKAPYzE5OGNh] included in the request is invalid.',
            },
          },
        },
      },
    });
    const err = await service
      .swapImagesToAssets(oneImage(), 't1')
      .catch((e: Error) => e);
    expect((err as Error).message).toBe(
      "We couldn't prepare your reference image right now. Please try again later.",
    );
    expect((err as Error).message).not.toMatch(/AKAP|401|InvalidAccessKey/);
  });

  it('429 rate limit → asks the user to retry in a moment, still cleans up', async () => {
    mockApi([]);
    axiosPost.mockImplementation(async (url: string) => {
      const action = new URL(url).searchParams.get('Action');
      if (action === 'CreateAsset') {
        throw {
          isAxiosError: true,
          message: 'x',
          response: { status: 429, data: {} },
        };
      }
      return { data: { Result: { Id: 'group-1' } } };
    });
    await expect(service.swapImagesToAssets(oneImage(), 't1')).rejects.toThrow(
      'The service is busy right now. Please try again in a moment.',
    );
    expect(actions()).toEqual([
      'CreateAssetGroup',
      'CreateAsset',
      'DeleteAssetGroup',
    ]);
  });

  it('cleanup never throws when delete fails', async () => {
    mockApi([], 'DeleteAsset');
    await expect(
      service.cleanup('t1', { groupId: 'g', assetIds: ['a1', 'a2'] }),
    ).resolves.toBeUndefined();
    expect(actions()).toEqual([
      'DeleteAsset',
      'DeleteAsset',
      'DeleteAssetGroup',
    ]);
  });
});
