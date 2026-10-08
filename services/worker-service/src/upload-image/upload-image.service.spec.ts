import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  PromptGuideImageRepository,
  RefImageRepository,
  StorageUrlService,
  TosService,
} from '@ai-media/share';
import { PresignUploadInput, UploadImageService } from './upload-image.service';

jest.mock('../configs', () => ({
  appConfigs: () => ({}),
  tosConfigs: () => ({ tosBucket: 'bucket' }),
}));

type RepoMock = Record<
  'create' | 'findOne' | 'updateMany' | 'deleteMany',
  jest.Mock
>;

const makeRepo = (): RepoMock => ({
  create: jest.fn().mockResolvedValue({}),
  findOne: jest.fn(),
  updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
});

describe('UploadImageService direct upload', () => {
  let refRepo: RepoMock;
  let guideRepo: RepoMock;
  let tos: Record<'getPreSignedPutUrl' | 'headObject' | 'deleteObject', jest.Mock>;
  let service: UploadImageService;

  const base: PresignUploadInput = {
    kind: 'ref',
    userId: 'u1',
    index: 0,
    uid: 'abc',
    organizationId: 'org',
    projectId: 'proj',
    generateType: 'image',
    fileName: 'cat.png',
    contentType: 'image/png',
    size: 1024,
  };

  beforeEach(() => {
    refRepo = makeRepo();
    guideRepo = makeRepo();
    tos = {
      getPreSignedPutUrl: jest.fn().mockReturnValue('https://put'),
      headObject: jest.fn(),
      deleteObject: jest.fn().mockResolvedValue({}),
    };
    const storageUrl = { toDisplayUrl: jest.fn().mockResolvedValue('https://get') };
    service = new UploadImageService(
      refRepo as unknown as RefImageRepository,
      guideRepo as unknown as PromptGuideImageRepository,
      tos as unknown as TosService,
      storageUrl as unknown as StorageUrlService,
    );
  });

  it('presign reserves an uploading row and returns a PUT url', async () => {
    const res = await service.presignUpload(base);
    expect(res).toMatchObject({
      uid: 'abc',
      imagePath: 'organize/org/proj/upload/abc.png',
      uploadUrl: 'https://put',
    });
    expect(refRepo.create.mock.calls[0][0].data).toMatchObject({
      status: 'uploading',
      imagePath: res.imagePath,
    });
  });

  it('presign prompt-guide uses the prompt-guide key and repo', async () => {
    const res = await service.presignUpload({
      ...base,
      kind: 'prompt-guide',
      projectId: undefined,
      promptGuideId: '7',
    });
    expect(res.imagePath).toBe('organize/org/prompt-guide/abc.png');
    expect(guideRepo.create.mock.calls[0][0].data.promptGuideId).toBe(7);
    expect(refRepo.create).not.toHaveBeenCalled();
  });

  it.each([
    ['unsupported type', { contentType: 'application/x-msdownload' }],
    ['too large', { size: 501 * 1024 * 1024 }],
    ['zero size', { size: 0 }],
    ['missing projectId', { projectId: undefined }],
  ])('presign rejects %s without creating a row', async (_label, patch) => {
    await expect(service.presignUpload({ ...base, ...patch })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(refRepo.create).not.toHaveBeenCalled();
  });

  it('confirm flips the row to waiting using the real size/type from TOS', async () => {
    refRepo.findOne.mockResolvedValue({ imagePath: 'k.png', imageName: 'cat.png' });
    tos.headObject.mockResolvedValue({ 'content-length': '2048', 'content-type': 'image/png' });
    const res = await service.confirmUpload('ref', 'abc');
    expect(refRepo.updateMany).toHaveBeenCalledWith({
      where: { uid: 'abc' },
      data: { status: 'waiting', imageSize: 2048, imageType: 'image/png' },
    });
    expect(res).toEqual({
      uid: 'abc',
      name: 'cat.png',
      url: 'https://get',
      imagePath: 'k.png',
      status: 'waiting',
    });
  });

  it('confirm without a pending row is 404', async () => {
    refRepo.findOne.mockResolvedValue(null);
    await expect(service.confirmUpload('ref', 'abc')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('confirm before the PUT finished is 400 and keeps the row', async () => {
    refRepo.findOne.mockResolvedValue({ imagePath: 'k.png', imageName: 'cat.png' });
    tos.headObject.mockResolvedValue(undefined);
    await expect(service.confirmUpload('ref', 'abc')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(refRepo.deleteMany).not.toHaveBeenCalled();
  });

  it('confirm deletes object and row when the uploaded file is not allowed', async () => {
    refRepo.findOne.mockResolvedValue({ imagePath: 'k.exe', imageName: 'x.exe' });
    tos.headObject.mockResolvedValue({
      'content-length': '10',
      'content-type': 'application/octet-stream',
    });
    await expect(service.confirmUpload('ref', 'abc')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tos.deleteObject).toHaveBeenCalledWith('bucket', 'k.exe');
    expect(refRepo.deleteMany).toHaveBeenCalledWith({ where: { uid: 'abc' } });
  });
});
