import axios from 'axios';
import { TosService } from '@ai-media/share';
import { VideoStorageService } from './video-storage.service';

jest.mock(
  'src/configs',
  () => ({ tosConfigs: () => ({ tosBucket: 'bucket' }) }),
  {
    virtual: true,
  },
);
jest.mock('axios');
jest.mock('fluent-ffmpeg', () => {
  const chain = {
    screenshots: () => chain,
    on: (event: string, cb: () => void) => {
      if (event === 'end') setImmediate(cb);
      return chain;
    },
  };
  const ffmpeg = Object.assign(() => chain, {
    setFfmpegPath: jest.fn(),
    setFfprobePath: jest.fn(),
  });
  return ffmpeg;
});
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    promises: {
      writeFile: jest.fn().mockResolvedValue(undefined),
      readFile: jest.fn().mockResolvedValue(Buffer.from('thumb')),
      rm: jest.fn().mockResolvedValue(undefined),
    },
  };
});

const axiosGet = axios.get as jest.Mock;

describe('VideoStorageService', () => {
  let tos: Record<
    'fetchObject' | 'createVideoThumbnail' | 'putObject',
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
    };
    axiosGet.mockReset().mockResolvedValue({ data: new ArrayBuffer(4) });
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
    expect(axiosGet).not.toHaveBeenCalled();
    expect(tos.putObject).not.toHaveBeenCalled();
  });

  it('keeps the original object naming', async () => {
    const result = await service.storeVideoWithThumbnail(input);
    expect(result.file).toMatch(/^\d+-[0-9a-f-]+\.mp4$/);
    expect(result.thumbnail).toMatch(/^thumb-\d+\.png$/);
  });

  it('fetch fails: falls back and uploads video + thumbnail via the pod', async () => {
    tos.fetchObject.mockRejectedValue(new Error('TLS handshake timeout'));
    await service.storeVideoWithThumbnail(input);
    expect(axiosGet).toHaveBeenCalledTimes(1);
    expect(tos.putObject).toHaveBeenCalledTimes(2);
  });

  it('fetch hangs past the timeout: falls back instead of waiting', async () => {
    jest.useFakeTimers();
    tos.fetchObject.mockReturnValue(new Promise(() => undefined));
    const pending = service.storeVideoWithThumbnail(input);
    // timer ของ fetch ถูกสร้างแบบ sync ตอนเรียก — jest 29.0 ยังไม่มี advanceTimersByTimeAsync
    jest.advanceTimersByTime(30_000);
    jest.useRealTimers();
    await pending;
    expect(axiosGet).toHaveBeenCalledTimes(1);
    expect(tos.putObject).toHaveBeenCalledTimes(2);
  });

  it('snapshot fails: uploads only the thumbnail (video already stored)', async () => {
    tos.createVideoThumbnail.mockRejectedValue(new Error('no IMP'));
    await service.storeVideoWithThumbnail(input);
    expect(tos.putObject).toHaveBeenCalledTimes(1);
    expect(tos.putObject.mock.calls[0][1]).toContain('thumb-');
  });

  it('fetch and download both fail: surfaces the error so the job is marked failed', async () => {
    tos.fetchObject.mockRejectedValue(new Error('fetch down'));
    axiosGet.mockRejectedValue(new Error('404'));
    await expect(service.storeVideoWithThumbnail(input)).rejects.toThrow(
      'Error processing video: 404',
    );
  });
});
