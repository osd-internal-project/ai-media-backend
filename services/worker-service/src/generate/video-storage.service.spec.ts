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
      expect.stringContaining('.jpg'),
      1000,
      'jpg',
      640,
    );
    expect(tos.putObject).not.toHaveBeenCalled();
  });

  it('names the thumbnail after the video id so concurrent jobs never collide', async () => {
    const result = await service.storeVideoWithThumbnail(input);
    expect(result.file).toMatch(/^\d+-[0-9a-f-]+\.mp4$/);
    expect(result.thumbnail).toBe(`thumb-${result.file.replace(/\.mp4$/, '')}.jpg`);
  });

  it('two videos stored in the same millisecond get different thumbnails', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const a = await service.storeVideoWithThumbnail(input);
    const b = await service.storeVideoWithThumbnail(input);
    jest.restoreAllMocks();
    expect(a.thumbnail).not.toBe(b.thumbnail);
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
    jest.advanceTimersByTime(90_000);
    jest.useRealTimers();
    await expect(pending).rejects.toThrow('timed out after 90000ms');
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
