import {
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  PromptGuideImageRepository,
  RefImageRepository,
  StorageUrlService,
  TosService,
} from '@ai-media/share';
import { UploadPolicyService } from './upload-policy.service';

jest.mock('../configs', () => ({
  appConfigs: () => ({}),
  tosConfigs: () => ({ tosBucket: 'bucket' }),
}));

type Repo = Record<'findOne' | 'create', jest.Mock>;
const makeRepo = (): Repo => ({
  findOne: jest.fn().mockResolvedValue(null),
  create: jest.fn().mockResolvedValue({}),
});

describe('UploadPolicyService', () => {
  let tos: Record<'createPostPolicy' | 'headObject' | 'deleteObject', jest.Mock>;
  let refRepo: Repo;
  let guideRepo: Repo;
  let service: UploadPolicyService;
  const query = {
    kind: 'ref' as const,
    organizationId: 'org',
    projectId: 'proj',
    userId: 'u1',
    mediaType: 'image' as const,
  };

  beforeEach(() => {
    process.env.WORKER_PUBLIC_URL = 'https://sit.example/public/api/v1/worker/';
    process.env.TOS_SECRET_KEY = 'secret';
    tos = {
      createPostPolicy: jest.fn((input) => ({ input })),
      headObject: jest.fn().mockResolvedValue({
        'content-length': '70',
        'content-type': 'image/png',
      }),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    refRepo = makeRepo();
    guideRepo = makeRepo();
    service = new UploadPolicyService(
      tos as unknown as TosService,
      refRepo as unknown as RefImageRepository,
      guideRepo as unknown as PromptGuideImageRepository,
      { toDisplayUrl: jest.fn().mockResolvedValue('https://get') } as unknown as StorageUrlService,
    );
  });

  afterEach(() => {
    delete process.env.WORKER_PUBLIC_URL;
  });

  /** สร้าง policy แล้วดึง scope/token ที่ฝังใน callback body ออกมา เหมือนที่ TOS จะส่งกลับมา */
  const issue = (q = query) => {
    service.createPolicy(q);
    const input = tos.createPostPolicy.mock.calls.at(-1)[0];
    const scope = /"scope":"([^"]+)"/.exec(input.callback.body)![1];
    const token = /"token":"([^"]+)"/.exec(input.callback.body)![1];
    return { input, scope, token };
  };

  it('issues a project-scoped policy with the callback pinned', () => {
    const { input } = issue();
    expect(input).toMatchObject({
      keyPrefix: 'organize/org/proj/upload/',
      contentTypePrefix: 'image/',
      maxBytes: 20 * 1024 * 1024,
      expiresSec: 15 * 60,
    });
    expect(input.callback.url).toBe(
      'https://sit.example/public/api/v1/worker/upload/callback',
    );
    // TOS variables stay unquoted, otherwise TOS cannot resolve the JSON body
    expect(input.callback.body).toContain('"key":${object}');
    expect(input.callback.body).toContain('"uid":${x:uid}');
  });

  it('refuses to issue a policy when TOS cannot reach the callback', () => {
    delete process.env.WORKER_PUBLIC_URL;
    expect(() => service.createPolicy(query)).toThrow(
      InternalServerErrorException,
    );
  });

  it('callback creates the row and returns the link in the old upload shape', async () => {
    const { scope, token } = issue();
    const res = await service.handleCallback({
      key: 'organize/org/proj/upload/rc-1.png',
      uid: 'rc-1',
      name: encodeURIComponent('รูป "a".png'),
      index: '0',
      generateType: 'video',
      scope,
      token,
    });
    expect(refRepo.create.mock.calls[0][0].data).toMatchObject({
      uid: 'rc-1',
      userId: 'u1',
      projectId: 'proj',
      imagePath: 'organize/org/proj/upload/rc-1.png',
      imageName: 'รูป "a".png',
      imageSize: 70,
      imageType: 'image/png',
      generateType: 'video',
      status: 'waiting',
    });
    expect(res).toEqual({
      uid: 'rc-1',
      name: 'รูป "a".png',
      url: 'https://get',
      imagePath: 'organize/org/proj/upload/rc-1.png',
      status: 'waiting',
    });
  });

  it('prompt-guide callback writes to the prompt guide table', async () => {
    const { scope, token } = issue({
      ...query,
      kind: 'prompt-guide',
      projectId: undefined,
      promptGuideId: '7',
    } as never);
    await service.handleCallback({
      key: 'organize/org/prompt-guide/rc-2.png',
      uid: 'rc-2',
      scope,
      token,
    });
    expect(guideRepo.create.mock.calls[0][0].data.promptGuideId).toBe(7);
    expect(refRepo.create).not.toHaveBeenCalled();
  });

  it.each([
    ['forged token', (s: string, t: string) => ({ scope: s, token: t.replace(/.$/, '0') })],
    ['tampered scope', (s: string, t: string) => ({ scope: s + 'x', token: t })],
    ['missing token', (s: string) => ({ scope: s })],
  ])('rejects a callback with a %s', async (_label, build) => {
    const { scope, token } = issue();
    await expect(
      service.handleCallback({
        key: 'organize/org/proj/upload/rc-1.png',
        uid: 'rc-1',
        ...build(scope, token),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(refRepo.create).not.toHaveBeenCalled();
  });

  it('rejects a key outside the signed prefix', async () => {
    const { scope, token } = issue();
    await expect(
      service.handleCallback({
        key: 'organize/other-org/proj/upload/rc-1.png',
        uid: 'rc-1',
        scope,
        token,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a callback for an object that is not in TOS', async () => {
    const { scope, token } = issue();
    tos.headObject.mockResolvedValue(undefined);
    await expect(
      service.handleCallback({
        key: 'organize/org/proj/upload/rc-1.png',
        uid: 'rc-1',
        scope,
        token,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a repeated callback for the same file does not create a second row', async () => {
    const { scope, token } = issue();
    refRepo.findOne.mockResolvedValue({
      imagePath: 'organize/org/proj/upload/rc-1.png',
    });
    await service.handleCallback({
      key: 'organize/org/proj/upload/rc-1.png',
      uid: 'rc-1',
      scope,
      token,
    });
    expect(refRepo.create).not.toHaveBeenCalled();
  });

  it('the same uid pointing at another file is a conflict', async () => {
    const { scope, token } = issue();
    refRepo.findOne.mockResolvedValue({
      imagePath: 'organize/org/proj/upload/other.png',
    });
    await expect(
      service.handleCallback({
        key: 'organize/org/proj/upload/rc-1.png',
        uid: 'rc-1',
        scope,
        token,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('policy size limit follows the media type', () => {
    expect(issue({ ...query, mediaType: 'video' } as never).input.maxBytes).toBe(
      500 * 1024 * 1024,
    );
    expect(issue({ ...query, mediaType: 'audio' } as never).input.maxBytes).toBe(
      50 * 1024 * 1024,
    );
  });

  const callback = (scope: string, token: string, key: string, uid = 'rc-1') =>
    service.handleCallback({ key, uid, scope, token });

  it('rejects and deletes an SVG even though it is image/*', async () => {
    const { scope, token } = issue();
    tos.headObject.mockResolvedValue({
      'content-length': '70',
      'content-type': 'image/svg+xml',
    });
    await expect(
      callback(scope, token, 'organize/org/proj/upload/rc-1.svg'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tos.deleteObject).toHaveBeenCalledWith(
      'bucket',
      'organize/org/proj/upload/rc-1.svg',
    );
    expect(refRepo.create).not.toHaveBeenCalled();
  });

  it('rejects and deletes an image larger than 20MB', async () => {
    const { scope, token } = issue();
    tos.headObject.mockResolvedValue({
      'content-length': String(25 * 1024 * 1024),
      'content-type': 'image/jpeg',
    });
    await expect(
      callback(scope, token, 'organize/org/proj/upload/rc-1.jpg'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tos.deleteObject).toHaveBeenCalled();
  });

  it('rejects a video uploaded with an image policy', async () => {
    const { scope, token } = issue();
    tos.headObject.mockResolvedValue({
      'content-length': '70',
      'content-type': 'video/mp4',
    });
    await expect(
      callback(scope, token, 'organize/org/proj/upload/rc-1.mp4'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([
    ['another uid', 'organize/org/proj/upload/other.png'],
    ['a nested path', 'organize/org/proj/upload/rc-1/x.png'],
    ['a double extension', 'organize/org/proj/upload/rc-1.png.html'],
  ])('rejects a key that points at %s', async (_label, key) => {
    const { scope, token } = issue();
    await expect(callback(scope, token, key)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(tos.headObject).not.toHaveBeenCalled();
  });

  it('accepts a key without an extension', async () => {
    const { scope, token } = issue();
    await callback(scope, token, 'organize/org/proj/upload/rc-1');
    expect(refRepo.create).toHaveBeenCalled();
  });
});
