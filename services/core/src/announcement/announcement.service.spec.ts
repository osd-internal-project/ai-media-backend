import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  AnnouncementRepository,
  AuthUser,
  StorageUrlService,
  TosService,
} from '@ai-media/share';
import { Announcement } from '@prisma/client';
import { AnnouncementService } from './announcement.service';
import { SaveAnnouncementDto } from './dto/save-announcement.dto';

const admin: AuthUser = { userId: 'u1', token: 't1', role: 'SUPER_ADMIN ' };
const member: AuthUser = { userId: 'u2', token: 't2', role: 'MEMBER' };

const row = (over: Partial<Announcement> = {}): Announcement => ({
  id: 'a1',
  category: 'PROMOTION',
  title: 'Creator Challenge',
  body: null,
  imageKey: 'announcements/old.jpg',
  isActive: true,
  sortOrder: 0,
  createdAt: new Date('2026-10-01'),
  updatedAt: new Date('2026-10-02'),
  ...over,
});

const dto: SaveAnnouncementDto = {
  category: 'SYSTEM_UPDATE',
  title: '  New video model  ',
  body: '',
};

describe('AnnouncementService', () => {
  let repo: jest.Mocked<
    Pick<
      AnnouncementRepository,
      'findMany' | 'findOne' | 'create' | 'update' | 'delete'
    >
  >;
  let tos: jest.Mocked<Pick<TosService, 'putObject' | 'deleteObject'>>;
  let service: AnnouncementService;

  beforeEach(() => {
    repo = {
      findMany: jest.fn().mockResolvedValue([row()]),
      findOne: jest.fn().mockResolvedValue(row()),
      create: jest
        .fn()
        .mockImplementation(({ data }) => Promise.resolve(row(data))),
      update: jest
        .fn()
        .mockImplementation(({ data }) => Promise.resolve(row(data))),
      delete: jest.fn().mockResolvedValue(row()),
    };
    tos = {
      putObject: jest.fn().mockResolvedValue(undefined),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    const storageUrl = {
      toDisplayUrl: jest.fn((key: string | null) =>
        Promise.resolve(key ? `https://cdn/${key}` : null),
      ),
    };
    // mock เฉพาะเมธอดที่ service เรียก
    service = new AnnouncementService(
      repo as unknown as AnnouncementRepository,
      tos as unknown as TosService,
      storageUrl as unknown as StorageUrlService,
    );
  });

  it('rejects non-admins and missing users', async () => {
    await expect(service.findAll(member)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.create(undefined, dto, undefined),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('public list asks only for active rows in display order and hides the raw key', async () => {
    const [view] = await service.findActive();
    expect(repo.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    expect(view.imageUrl).toBe('https://cdn/announcements/old.jpg');
    expect(view).not.toHaveProperty('imageKey');
  });

  it('creates a text-only announcement inactive by default with trimmed fields', async () => {
    const view = await service.create(admin, dto, undefined);
    expect(repo.create).toHaveBeenCalledWith({
      data: {
        category: 'SYSTEM_UPDATE',
        title: 'New video model',
        body: null,
        imageKey: null,
        isActive: false,
        sortOrder: 0,
      },
    });
    expect(view.imageUrl).toBeNull();
    expect(tos.putObject).not.toHaveBeenCalled();
  });

  it('removing the image on update deletes the old object after the row is saved', async () => {
    const view = await service.update(
      admin,
      'a1',
      { ...dto, removeImage: true },
      undefined,
    );
    expect(view.imageUrl).toBeNull();
    expect(tos.deleteObject).toHaveBeenCalledWith(
      undefined,
      'announcements/old.jpg',
    );
    expect(repo.update.mock.invocationCallOrder[0]).toBeLessThan(
      tos.deleteObject.mock.invocationCallOrder[0],
    );
  });

  it('keeps the old image when the update sends no file', async () => {
    await service.update(admin, 'a1', dto, undefined);
    expect(repo.update.mock.calls[0][0].data).toMatchObject({
      imageKey: 'announcements/old.jpg',
      isActive: true,
    });
    expect(tos.deleteObject).not.toHaveBeenCalled();
  });

  it('delete still succeeds when the storage cleanup fails', async () => {
    tos.deleteObject.mockRejectedValue(new Error('tos down'));
    await expect(service.remove(admin, 'a1')).resolves.toBeUndefined();
    expect(repo.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
  });

  it('404s on an unknown id', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.setActive(admin, 'zz', false)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
