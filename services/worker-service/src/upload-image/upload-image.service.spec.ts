import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  GalleryRepository,
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
  let galleryRepo: RepoMock & { findMany: jest.Mock };
  let access: Record<
    'assertCanWrite' | 'assertCanManageRef' | 'assertCanManagePromptGuideImage' | 'assertSameUser',
    jest.Mock
  >;
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
    galleryRepo = { ...makeRepo(), findMany: jest.fn().mockResolvedValue([]) };
    access = {
      assertCanWrite: jest.fn(),
      assertCanManageRef: jest.fn(),
      assertCanManagePromptGuideImage: jest.fn(),
      assertSameUser: jest.fn(),
    };
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
      // การตรวจสิทธิ์ทดสอบแยกใน upload-access.service.spec.ts
      access as never,
      galleryRepo as unknown as GalleryRepository,
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

  it.each([
    ['an SVG', { contentType: 'image/svg+xml', fileName: 'x.svg' }],
    ['HTML', { contentType: 'text/html', fileName: 'x.html' }],
    ['an extension that does not match the type', { fileName: 'x.html' }],
    ['an image over 20MB', { size: 21 * 1024 * 1024 }],
  ])('presign rejects %s', async (_label, patch) => {
    await expect(
      service.presignUpload({ ...base, ...patch }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(refRepo.create).not.toHaveBeenCalled();
  });

  it('presign allows a 400MB video', async () => {
    await service.presignUpload({
      ...base,
      contentType: 'video/mp4',
      fileName: 'clip.MP4',
      size: 400 * 1024 * 1024,
    });
    expect(refRepo.create).toHaveBeenCalled();
  });

  it('confirm deletes an SVG that was PUT under an image presign', async () => {
    refRepo.findOne.mockResolvedValue({
      uid: 'abc',
      imagePath: 'organize/org/proj/upload/abc.png',
      imageName: 'cat.png',
    });
    tos.headObject.mockResolvedValue({
      'content-length': '70',
      'content-type': 'image/svg+xml',
    });
    await expect(service.confirmUpload('ref', 'abc')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tos.deleteObject).toHaveBeenCalled();
    expect(refRepo.deleteMany).toHaveBeenCalled();
  });

  describe('editor-export', () => {
    const uid = '3f2b8c1e-7a4d-4e2b-9c1a-5d6e7f8a9b0c';
    const exportInput: PresignUploadInput = {
      ...base,
      kind: 'editor-export',
      uid,
      generateType: 'video',
      fileName: 'trip.mp4',
      contentType: 'video/mp4',
      size: 20 * 1024 * 1024,
    };
    const key = `organize/org/proj/video-generate/${uid}.mp4`;
    const pendingRow = {
      id: uid,
      userId: 'u1',
      projectId: 'proj',
      prompt: 'trip.mp4',
      generateConfig: { source: 'video-editor', objectKey: key },
    };

    it('presign reserves a hidden gallery row at the video output key', async () => {
      const res = await service.presignUpload(exportInput);
      expect(res).toMatchObject({ uid, imagePath: key, uploadUrl: 'https://put' });
      expect(access.assertCanWrite).toHaveBeenCalledWith(undefined, {
        organizationId: 'org',
        projectId: 'proj',
        promptGuideId: undefined,
      });
      expect(galleryRepo.create.mock.calls[0][0].data).toMatchObject({
        id: uid,
        projectId: 'proj',
        imageUrl: `${uid}.mp4`,
        resultUrl: [`${uid}.mp4`],
        typeGenerate: 'video',
        featureType: 'editor',
        genneratedStatus: 'UPLOADING',
        status: false,
      });
      expect(refRepo.create).not.toHaveBeenCalled();
    });

    it.each([
      ['a non-UUID uid', { uid: 'abc' }],
      ['WebM', { contentType: 'video/webm', fileName: 'trip.webm' }],
      ['a non-mp4 extension', { fileName: 'trip.m4v' }],
      ['missing projectId', { projectId: undefined }],
    ])('presign rejects %s', async (_label, patch) => {
      await expect(service.presignUpload({ ...exportInput, ...patch })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(galleryRepo.create).not.toHaveBeenCalled();
    });

    it('confirm shows the video in the library', async () => {
      galleryRepo.findOne.mockResolvedValue(pendingRow);
      tos.headObject.mockResolvedValue({ 'content-length': '2048', 'content-type': 'video/mp4' });
      const res = await service.confirmUpload('editor-export', uid);
      expect(tos.headObject).toHaveBeenCalledWith('bucket', key);
      expect(galleryRepo.updateMany).toHaveBeenCalledWith({
        where: { id: uid },
        data: { genneratedStatus: 'SUCCESS', status: true },
      });
      expect(res).toMatchObject({ uid, imagePath: key, url: 'https://get', status: 'saved' });
    });

    it('confirm checks project access on the reserved row', async () => {
      galleryRepo.findOne.mockResolvedValue(pendingRow);
      tos.headObject.mockResolvedValue({ 'content-length': '2048', 'content-type': 'video/mp4' });
      await service.confirmUpload('editor-export', uid);
      expect(access.assertCanManageRef).toHaveBeenCalledWith(undefined, pendingRow);
    });

    it('confirm deletes object and row when TOS holds something other than MP4', async () => {
      galleryRepo.findOne.mockResolvedValue(pendingRow);
      tos.headObject.mockResolvedValue({ 'content-length': '10', 'content-type': 'text/html' });
      await expect(service.confirmUpload('editor-export', uid)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(tos.deleteObject).toHaveBeenCalledWith('bucket', key);
      expect(galleryRepo.deleteMany).toHaveBeenCalledWith({ where: { id: uid } });
    });

    it('confirm without a pending row is 404', async () => {
      galleryRepo.findOne.mockResolvedValue(null);
      await expect(service.confirmUpload('editor-export', uid)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('cron removes exports that were never confirmed', async () => {
      galleryRepo.findMany.mockResolvedValue([pendingRow]);
      await service.deleteStaleEditorExports();
      expect(galleryRepo.findMany.mock.calls[0][0].where).toMatchObject({
        featureType: 'editor',
        genneratedStatus: 'UPLOADING',
      });
      expect(tos.deleteObject).toHaveBeenCalledWith('bucket', key);
      expect(galleryRepo.deleteMany).toHaveBeenCalledWith({ where: { id: uid } });
    });
  });
});
