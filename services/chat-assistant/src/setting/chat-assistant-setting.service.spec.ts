import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@ai-media/share';
import {
  CHAT_ASSISTANT_ENABLED_KEY,
  ChatAssistantSettingService,
} from './chat-assistant-setting.service';

describe('ChatAssistantSettingService', () => {
  let findUnique: jest.Mock;
  let upsert: jest.Mock;
  let service: ChatAssistantSettingService;

  beforeEach(() => {
    findUnique = jest.fn();
    upsert = jest.fn();
    service = new ChatAssistantSettingService({
      appSetting: { findUnique, upsert },
    } as unknown as PrismaService);
  });

  it('is off when no row exists', async () => {
    findUnique.mockResolvedValue(null);
    await expect(service.isEnabled()).resolves.toBe(false);
    await expect(service.assertEnabled()).rejects.toThrow('Chat assistant is turned off');
  });

  it('is off when the table cannot be read (migration not applied)', async () => {
    findUnique.mockRejectedValue(new Error('relation "app_setting" does not exist'));
    await expect(service.isEnabled()).resolves.toBe(false);
  });

  it('is on only for a stored true', async () => {
    findUnique.mockResolvedValue({ key: CHAT_ASSISTANT_ENABLED_KEY, value: true });
    await expect(service.assertEnabled()).resolves.toBeUndefined();
  });

  it('refuses a non-admin and stores the value for a super admin', async () => {
    await expect(
      service.setEnabled({ userId: 'u1', token: 't', role: 'USER' }, true),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.setEnabled(undefined, true)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(upsert).not.toHaveBeenCalled();

    await expect(
      service.setEnabled({ userId: 'admin', token: 't', role: 'SUPER_ADMIN ' }, true),
    ).resolves.toEqual({ enabled: true });
    expect(upsert).toHaveBeenCalledWith({
      where: { key: CHAT_ASSISTANT_ENABLED_KEY },
      create: { key: CHAT_ASSISTANT_ENABLED_KEY, value: true, updatedBy: 'admin' },
      update: { value: true, updatedBy: 'admin' },
    });
  });
});
