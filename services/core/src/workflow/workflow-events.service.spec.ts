import { WorkflowEventsService } from './workflow-events.service';

const baseBlock = {
  id: 'b1',
  workflowConversationId: 'c1',
  type: 'image',
  status: 'processing',
  taskId: 't1',
  outputUrl: null as string | null,
  duration: null as number | null,
  createdAt: new Date(Date.now() - 10_000),
};

const setup = (block: Record<string, unknown>, updatedCount = 1) => {
  const blockRepo = {
    findOne: jest.fn().mockResolvedValue(block),
    updateMany: jest.fn().mockResolvedValue({ count: updatedCount }),
  };
  const galleryRepo = {
    findOne: jest.fn().mockResolvedValue({
      genneratedStatus: 'SUCCESS',
      resultUrl: ['out.jpg'],
      imageUrl: 'out.jpg',
    }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const logRepo = { updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
  const gateway = { emitToRoom: jest.fn() };
  const media = { presignObject: jest.fn().mockResolvedValue('https://signed') };
  const service = new WorkflowEventsService(
    blockRepo as never,
    logRepo as never,
    galleryRepo as never,
    gateway as never,
    media as never,
  );
  // handleMessage เป็น private — เรียกตรงเพื่อจำลอง message จาก Redis
  const handle = (channel: string, payload: Record<string, unknown>) =>
    (
      service as unknown as {
        handleMessage: (c: string, m: string) => Promise<void>;
      }
    ).handleMessage(channel, JSON.stringify({ payload }));
  return { service, handle, blockRepo, galleryRepo, gateway };
};

describe('WorkflowEventsService', () => {
  it('ignores a per-image image-complete that arrives after success', async () => {
    const { handle, blockRepo, gateway } = setup({
      ...baseBlock,
      status: 'success',
    });
    await handle('worker:image-complete', {
      taskId: 't1',
      index: 1,
      total: 1,
      projectId: 'p1',
    });
    expect(blockRepo.updateMany).not.toHaveBeenCalled();
    expect(gateway.emitToRoom).not.toHaveBeenCalled();
  });

  it('writes processing only while the block is still active for the same task', async () => {
    const { handle, blockRepo } = setup(baseBlock);
    await handle('worker:progress', { taskId: 't1', projectId: 'p1' });
    expect(blockRepo.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'b1',
        taskId: 't1',
        status: { in: ['pending', 'processing'] },
      },
      data: { status: 'processing' },
    });
  });

  it('does not emit progress when another replica already finished the block', async () => {
    const { handle, gateway } = setup(baseBlock, 0);
    await handle('worker:progress', { taskId: 't1', projectId: 'p1' });
    expect(gateway.emitToRoom).not.toHaveBeenCalled();
  });

  it('marks success on the final image-complete', async () => {
    const { handle, blockRepo, gateway } = setup(baseBlock);
    await handle('worker:image-complete', {
      taskId: 't1',
      success: true,
      projectId: 'p1',
    });
    expect(blockRepo.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'b1', taskId: 't1' },
        data: expect.objectContaining({
          status: 'success',
          outputUrl: 'out.jpg',
        }),
      }),
    );
    expect(gateway.emitToRoom).toHaveBeenCalledWith(
      'p1:workflow',
      'workflow.block.updated',
      expect.objectContaining({ status: 'success', outputUrl: 'https://signed' }),
    );
  });

  describe('healStuckBlock', () => {
    it('restores success when the gallery row finished', async () => {
      const { service, blockRepo } = setup(baseBlock);
      const stuck = { ...baseBlock, outputUrl: 'out.jpg', duration: 23 };
      await service.healStuckBlock(stuck as never, 'p1');
      expect(blockRepo.updateMany).toHaveBeenCalledWith({
        where: { id: 'b1', taskId: 't1' },
        data: { status: 'success', outputUrl: 'out.jpg', duration: 23 },
      });
    });

    it('leaves a block alone while its gallery row is still pending', async () => {
      const { service, blockRepo, galleryRepo } = setup(baseBlock);
      galleryRepo.findOne.mockResolvedValue({ genneratedStatus: 'PENDING' });
      const result = await service.healStuckBlock(baseBlock as never, 'p1');
      expect(result).toBeNull();
      expect(blockRepo.updateMany).not.toHaveBeenCalled();
    });

    it('skips blocks that are not processing', async () => {
      const { service, galleryRepo } = setup(baseBlock);
      await service.healStuckBlock(
        { ...baseBlock, status: 'success' } as never,
        'p1',
      );
      expect(galleryRepo.findOne).not.toHaveBeenCalled();
    });
  });
});
