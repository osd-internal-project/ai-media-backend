import axios from 'axios';
import { ByteplusAssetService } from './byteplus-asset.service';

jest.mock('axios');
const axiosPost = axios.post as jest.Mock;

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
    ).rejects.toThrow('Reference image was rejected by the provider');
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
    ).rejects.toThrow(/timed out/);
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
    ).rejects.toThrow('CreateAssetGroup: SignatureDoesNotMatch bad sig');
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
