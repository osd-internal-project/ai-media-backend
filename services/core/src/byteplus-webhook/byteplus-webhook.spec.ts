import { UnauthorizedException } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  buildByteplusVideoCallbackUrl,
  verifyByteplusCallbackSig,
  VIDEO_JOB_FINALIZE,
} from '@ai-media/share';
import { ByteplusWebhookController } from './byteplus-webhook.controller';
import { ByteplusWebhookService } from './byteplus-webhook.service';

const BASE = 'https://sit.example.com/public/api/v1/core/';

const sigOf = (taskId: string): string => {
  const url = buildByteplusVideoCallbackUrl(taskId);
  if (!url) throw new Error('callback env not set');
  return new URL(url).searchParams.get('sig') ?? '';
};

describe('BytePlus video webhook', () => {
  let add: jest.Mock;
  let controller: ByteplusWebhookController;
  const env = { ...process.env };

  beforeEach(() => {
    process.env.BYTEPLUS_CALLBACK_SECRET = 'test-secret';
    process.env.BYTEPLUS_CALLBACK_BASE_URL = BASE;
    add = jest.fn().mockResolvedValue(undefined);
    // ใช้แค่ add ของ Queue ใน service นี้
    const service = new ByteplusWebhookService({ add } as unknown as Queue);
    controller = new ByteplusWebhookController(service);
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it('builds a callback URL under the configured base without double slash', () => {
    const url = buildByteplusVideoCallbackUrl('task-1');
    expect(url).toMatch(
      /^https:\/\/sit\.example\.com\/public\/api\/v1\/core\/webhooks\/byteplus\/video\/task-1\?sig=[0-9a-f]{64}$/,
    );
  });

  it('returns null when no secret source is set so the worker falls back to polling', () => {
    delete process.env.BYTEPLUS_CALLBACK_SECRET;
    delete process.env.TOS_SECRET_KEY;
    expect(buildByteplusVideoCallbackUrl('task-1')).toBeNull();
  });

  it('returns null when the base URL is empty (SIT: Ark cannot reach us)', () => {
    process.env.BYTEPLUS_CALLBACK_BASE_URL = '';
    expect(buildByteplusVideoCallbackUrl('task-1')).toBeNull();
  });

  it('without BYTEPLUS_CALLBACK_SECRET derives the key from TOS_SECRET_KEY (deploy needs no new secret)', () => {
    delete process.env.BYTEPLUS_CALLBACK_SECRET;
    process.env.TOS_SECRET_KEY = 'tos-secret';
    const url = buildByteplusVideoCallbackUrl('task-1');
    expect(url).not.toBeNull();
    const sig = new URL(url!).searchParams.get('sig') ?? '';
    // core and worker share TOS_SECRET_KEY, so core verifies what worker signed
    expect(verifyByteplusCallbackSig('task-1', sig)).toBe(true);
    expect(verifyByteplusCallbackSig('task-2', sig)).toBe(false);
  });

  it('an explicit BYTEPLUS_CALLBACK_SECRET overrides the derived key', () => {
    process.env.TOS_SECRET_KEY = 'tos-secret';
    const explicitSig = sigOf('task-1');
    delete process.env.BYTEPLUS_CALLBACK_SECRET;
    expect(sigOf('task-1')).not.toBe(explicitSig);
  });

  it('rejects a wrong or missing sig with 401 and enqueues nothing', async () => {
    const body = { id: 'cgt-1', status: 'succeeded' };
    await expect(controller.video('task-1', 'bad', body, {})).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(
      controller.video('task-1', undefined, body, {}),
    ).rejects.toThrow(UnauthorizedException);
    // sig ของ task อื่นใช้ข้ามกันไม่ได้
    await expect(
      controller.video('task-1', sigOf('task-2'), body, {}),
    ).rejects.toThrow(UnauthorizedException);
    expect(add).not.toHaveBeenCalled();
  });

  it('acknowledges non-terminal statuses without enqueueing', async () => {
    const sig = sigOf('task-1');
    for (const status of ['queued', 'running']) {
      await expect(
        controller.video('task-1', sig, { id: 'cgt-1', status }, {}),
      ).resolves.toEqual({ ok: true });
    }
    await controller.video('task-1', sig, 'not-json', {});
    expect(add).not.toHaveBeenCalled();
  });

  it.each(['succeeded', 'failed', 'expired', 'cancelled'])(
    'enqueues one finalize job with a stable jobId on %s',
    async (status) => {
      const sig = sigOf('task-1');
      await controller.video('task-1', sig, { id: 'cgt-1', status }, {});
      expect(add).toHaveBeenCalledWith(
        VIDEO_JOB_FINALIZE,
        { taskId: 'task-1', providerTaskId: 'cgt-1' },
        expect.objectContaining({ jobId: `${VIDEO_JOB_FINALIZE}-task-1` }),
      );
    },
  );

  it('uses the same jobId for a repeated callback so BullMQ dedupes it', async () => {
    const sig = sigOf('task-1');
    const body = { id: 'cgt-1', status: 'succeeded' };
    await controller.video('task-1', sig, body, {});
    await controller.video('task-1', sig, body, {});
    const jobIds = add.mock.calls.map((call) => call[2].jobId);
    expect(new Set(jobIds).size).toBe(1);
  });
});
