import axios from 'axios';
import { UnrecoverableError } from 'bullmq';
import { AudioProcessor, parseAudioResponse } from './audio.service';

jest.mock('axios');
jest.mock('ioredis', () => {
  const RedisMock = jest
    .fn()
    .mockImplementation(() => ({ publish: jest.fn(), quit: jest.fn() }));
  return { __esModule: true, default: RedisMock, Redis: RedisMock };
});
jest.mock(
  'src/configs',
  () => ({ tosConfigs: () => ({ tosBucket: 'bucket' }) }),
  { virtual: true },
);

const post = axios.post as jest.Mock;

const body = {
  taskId: 't1',
  model: 'seed-audio-1.0',
  prompt: '@Audio1 says hello',
  projectId: 'proj',
  userId: 'u1',
  organizationId: 'org',
  typeGenerate: 'audio',
  format: 'mp3' as const,
  speechRate: 0,
  pitchRate: 3,
  references: [{ url: 'org/proj/upload/a.mp3' }, { speaker: 'voice_1' }],
};

const jobData = (extra: Record<string, unknown> = {}) => ({
  taskId: 't1',
  clientId: 'c1',
  body,
  userId: 'u1',
  sendApi: 'https://gw/seed-audio',
  sendConfig: { type: 'seedaudio1', configType: 'application/json' },
  authorization: 'org-key',
  ...extra,
});

const makeJob = (data = jobData(), attemptsMade = 0) => ({
  id: 'j1',
  data,
  attemptsMade,
  opts: { attempts: 3 },
  updateData: jest.fn(),
});

describe('parseAudioResponse', () => {
  it('reads base64 audio, duration and subtitles', () => {
    expect(
      parseAudioResponse({ audio: 'AAA', duration: 4.2, sentences: [{ t: 1 }] }),
    ).toEqual({
      audioBase64: 'AAA',
      url: null,
      duration: 4.2,
      subtitles: [{ t: 1 }],
    });
  });

  it('reads a url wrapped in data by the gateway', () => {
    expect(
      parseAudioResponse({ code: 0, data: { url: 'https://x/a.mp3' } }),
    ).toMatchObject({ audioBase64: null, url: 'https://x/a.mp3' });
  });

  it('throws the provider message on an error code', () => {
    expect(() =>
      parseAudioResponse({ code: 45000010, message: 'bad key' }),
    ).toThrow('bad key');
  });

  it('throws when there is no audio', () => {
    expect(() => parseAudioResponse({ code: 0 })).toThrow(
      'neither audio nor url',
    );
  });
});

describe('AudioProcessor', () => {
  let gallery: { updateMany: jest.Mock; create: jest.Mock; findOne: jest.Mock };
  let log: { updateMany: jest.Mock };
  let tos: { putObject: jest.Mock; fetchObject: jest.Mock };
  let storage: { toProviderUrl: jest.Mock; toDisplayUrl: jest.Mock };
  let helper: Record<string, jest.Mock>;
  let processor: AudioProcessor;

  beforeEach(() => {
    post.mockReset();
    gallery = {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn(),
      findOne: jest
        .fn()
        .mockResolvedValue({ generateConfig: { content: 'p', format: 'mp3' } }),
    };
    log = { updateMany: jest.fn() };
    tos = { putObject: jest.fn(), fetchObject: jest.fn() };
    storage = {
      toProviderUrl: jest.fn(async (key: string) => `https://signed/${key}`),
      toDisplayUrl: jest.fn().mockResolvedValue('https://display/a.mp3'),
    };
    helper = {
      getUsedCredit: jest.fn().mockResolvedValue({ token: 0, credit: 10 }),
      updateUsedCreditSuccess: jest.fn().mockResolvedValue({
        usedCreditAllowance: 10,
        holdCreditAllowance: 0,
      }),
      updateUsedCreditFail: jest.fn(),
      logAudit: jest.fn(),
      logError: jest.fn(),
    };
    processor = new AudioProcessor(
      { get: jest.fn().mockResolvedValue(null), set: jest.fn() } as never,
      gallery as never,
      log as never,
      tos as never,
      storage as never,
      helper as never,
      { findOne: jest.fn().mockResolvedValue({ type: 'audio' }) } as never,
    );
  });

  it('sends the Seed Audio payload, stores base64 audio and charges credit', async () => {
    post.mockResolvedValue({ data: { audio: 'AAAA', duration: 3 } });
    const job = makeJob();

    await processor.process(job as never);

    expect(post).toHaveBeenCalledWith(
      'https://gw/seed-audio',
      {
        model: 'seed-audio-1.0',
        text_prompt: '@Audio1 says hello',
        references: [
          { audio_url: 'https://signed/org/proj/upload/a.mp3' },
          { speaker: 'voice_1' },
        ],
        // speechRate 0 ไม่ถูกส่ง
        audio_config: { format: 'mp3', pitch_rate: 3 },
      },
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer org-key',
        },
      }),
    );
    const [, key, buffer, options] = tos.putObject.mock.calls[0];
    expect(key).toMatch(/^organize\/org\/proj\/audio-generate\/.+\.mp3$/);
    expect(buffer).toEqual(Buffer.from('AAAA', 'base64'));
    expect(options).toEqual({ contentType: 'audio/mpeg' });
    expect(job.updateData).toHaveBeenCalledWith(
      expect.objectContaining({
        output: expect.objectContaining({ duration: 3 }),
      }),
    );
    expect(gallery.updateMany).toHaveBeenCalledWith({
      where: { taskId: 't1' },
      data: expect.objectContaining({
        genneratedStatus: 'SUCCESS',
        typeGenerate: 'audio',
        generateConfig: { content: 'p', format: 'mp3', duration: 3 },
      }),
    });
    expect(helper.updateUsedCreditSuccess).toHaveBeenCalledWith(
      'u1',
      'org',
      'proj',
      'credit',
      10,
    );
  });

  it('lets TOS fetch a returned url', async () => {
    post.mockResolvedValue({ data: { url: 'https://provider/a.mp3' } });
    await processor.process(makeJob() as never);
    expect(tos.fetchObject).toHaveBeenCalledWith(
      'bucket',
      expect.stringMatching(/\.mp3$/),
      'https://provider/a.mp3',
    );
  });

  it('does not call the provider again on retry once output is stored', async () => {
    const job = makeJob(
      jobData({
        output: { objectName: 'x.mp3', duration: null, subtitles: null },
      }),
      1,
    );
    await processor.process(job as never);
    expect(post).not.toHaveBeenCalled();
    expect(helper.updateUsedCreditSuccess).toHaveBeenCalled();
  });

  it('refunds credit and marks FAILED when the provider rejects', async () => {
    post.mockRejectedValue({
      message: 'Request failed',
      response: { status: 400, data: { error: { message: 'prompt too long' } } },
    });
    await expect(processor.process(makeJob() as never)).rejects.toThrow(
      UnrecoverableError,
    );
    expect(helper.updateUsedCreditFail).toHaveBeenCalledWith(
      'u1',
      'org',
      'proj',
      'credit',
      10,
    );
    expect(gallery.updateMany).toHaveBeenCalledWith({
      where: { taskId: 't1' },
      data: { genneratedStatus: 'FAILED', status: false },
    });
  });

  it('keeps the credit hold when a retryable error will be retried', async () => {
    post.mockResolvedValue({ data: { audio: 'AAAA' } });
    tos.putObject.mockRejectedValue(new Error('TOS down'));
    await expect(processor.process(makeJob() as never)).rejects.toThrow(
      'TOS down',
    );
    expect(helper.updateUsedCreditFail).not.toHaveBeenCalled();
  });

  it('rejects an unknown sendConfig.type without retry', async () => {
    const job = makeJob(
      jobData({ sendConfig: { type: 'nope', configType: 'application/json' } }),
    );
    await expect(processor.process(job as never)).rejects.toThrow(
      'Unsupported audio sendConfig.type: "nope"',
    );
    expect(post).not.toHaveBeenCalled();
  });
});
