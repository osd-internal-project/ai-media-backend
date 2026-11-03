import { NotFoundException } from '@nestjs/common';
import {
  PhotoEventGenerationRepository,
  StorageUrlService,
} from '@ai-media/share';
import { PhotoEventPrintService } from './photo-event-print.service';
import { PublicPhotoEventService } from './public-photo-event.service';

const createdAt = new Date('2026-11-03T08:00:00Z');
const layout = {
  version: 1,
  paper: { widthMm: 102, heightMm: 152, bleedMm: 0, marginMm: 5 },
  background: { color: '#ffffff', fit: 'cover', imageKey: 'bg.png' },
  elements: [],
};

const setup = (activeTemplate: unknown) => {
  const findOne = jest.fn().mockResolvedValue({
    id: 'gen-1',
    projectId: 'proj-1',
    outputKey: 'out.jpg',
    createdAt,
  });
  const findActive = jest.fn().mockResolvedValue(activeTemplate);
  const service = new PublicPhotoEventService(
    { findOne } as unknown as PhotoEventGenerationRepository,
    {
      toDisplayUrl: jest.fn().mockResolvedValue('https://signed/out.jpg'),
    } as unknown as StorageUrlService,
    { findActive } as unknown as PhotoEventPrintService,
  );
  return { service, findOne, findActive };
};

describe('PublicPhotoEventService.findOne', () => {
  it('returns the active print design of the generation project', async () => {
    const { service, findActive } = setup({
      id: 'tpl-1',
      name: 'Template 1',
      isActive: true,
      layout,
      assetUrls: { 'bg.png': 'https://signed/bg.png' },
      updatedAt: createdAt,
    });

    await expect(service.findOne('gen-1')).resolves.toEqual({
      id: 'gen-1',
      imageUrl: 'https://signed/out.jpg',
      createdAt,
      printDesign: {
        layout,
        assetUrls: { 'bg.png': 'https://signed/bg.png' },
      },
    });
    expect(findActive).toHaveBeenCalledWith('proj-1');
  });

  it('returns a null print design when the event has no active template', async () => {
    const { service } = setup(null);

    await expect(service.findOne('gen-1')).resolves.toEqual({
      id: 'gen-1',
      imageUrl: 'https://signed/out.jpg',
      createdAt,
      printDesign: null,
    });
  });

  it('hides generations that are not finished', async () => {
    const { service, findOne } = setup(null);
    findOne.mockResolvedValue(null);

    await expect(service.findOne('gen-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
