import { TosService } from '@ai-media/share';
import { VideoStorageService } from './video-storage.service';

jest.mock(
  'src/configs',
  () => ({ tosConfigs: () => ({ tosBucket: 'bucket' }) }),
  {
    virtual: true,
  },
);

describe('VideoStorageService', () => {
  let tos: Record<
    'fetchObject' | 'createVideoThumbnail' | 'putObject' | 'deleteObject',
    jest.Mock
  >;
  let service: VideoStorageService;
  const input = {
    organizationId: 'org',
    projectId: 'proj',
    typeGenerate: 'video',
    sourceUrl: 'https://provider/video.mp4',
    durationSec: 5,
  };

  beforeEach(() => {
    tos = {
      fetchObject: jest.fn().mockResolvedValue({}),
      createVideoThumbnail: jest.fn().mockResolvedValue('thumb'),
      putObject: jest.fn().mockResolvedValue({}),
      deleteObject: jest.fn().mockResolvedValue({}),
    };
    service = new VideoStorageService(tos as unknown as TosService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('stores via TOS fetch + snapshot — no bytes through the pod', async () => {
    await service.storeVideoWithThumbnail(input);
    expect(tos.fetchObject).toHaveBeenCalledTimes(1);
    expect(tos.createVideoThumbnail).toHaveBeenCalledWith(
      'bucket',
      expect.stringContaining('.mp4'),
      expect.stringContaining('.png'),
      1000,
      'png',
    );
    expect(tos.putObject).not.toHaveBeenCalled();
  });

  it('keeps the original object naming', async () => {
    const result = await service.storeVideoWithThumbnail(input);
    expect(result.file).toMatch(/^\d+-[0-9a-f-]+\.mp4$/);
    expect(result.thumbnail).toMatch(/^thumb-\d+\.png$/);
  });

  it('fetch fails: surfaces the error so the job is marked failed', async () => {
    tos.fetchObject.mockRejectedValue(new Error('TLS handshake timeout'));
    await expect(service.storeVideoWithThumbnail(input)).rejects.toThrow(
      'Error processing video: TLS handshake timeout',
    );
    expect(tos.createVideoThumbnail).not.toHaveBeenCalled();
    expect(tos.putObject).not.toHaveBeenCalled();
  });

  it('fetch hangs past the timeout: fails instead of waiting', async () => {
    jest.useFakeTimers();
    tos.fetchObject.mockReturnValue(new Promise(() => undefined));
    const pending = service.storeVideoWithThumbnail(input);
    // timer ของ fetch ถูกสร้างแบบ sync ตอนเรียก — jest 29.0 ยังไม่มี advanceTimersByTimeAsync
    jest.advanceTimersByTime(30_000);
    jest.useRealTimers();
    await expect(pending).rejects.toThrow('timed out after 30000ms');
  });

  it('snapshot fails: removes the stored video and fails the job', async () => {
    tos.createVideoThumbnail.mockRejectedValue(new Error('no IMP'));
    await expect(service.storeVideoWithThumbnail(input)).rejects.toThrow(
      'Error processing video: no IMP',
    );
    expect(tos.deleteObject).toHaveBeenCalledWith(
      'bucket',
      expect.stringContaining('.mp4'),
    );
    expect(tos.putObject).not.toHaveBeenCalled();
  });
});
