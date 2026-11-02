import { PhotoEventTemplatesService } from './photo-event-templates.service';

const rows = [
  { uid: 'ref-1', imagePath: 'refs/1.png' },
  { uid: 'res-1', imagePath: 'results/1.png' },
  { uid: 'res-2', imagePath: 'results/2.png' },
];

describe('PhotoEventTemplatesService.findByProject', () => {
  it('returns refs as imageUrls and results as resultUrls', async () => {
    const service = new PhotoEventTemplatesService(
      {
        findManyWithPromptGuide: jest.fn().mockResolvedValue([
          {
            promptGuideId: 7,
            promptTail: null,
            sortOrder: 0,
            promptGuide: {
              title: 'Neon',
              description: null,
              textPrompt: 'p',
              promptGuideImages: ['ref-1'],
              promptGuideResults: ['res-1', 'res-2'],
            },
          },
        ]),
      } as never,
      {} as never,
      {
        findMany: jest.fn(
          async ({ where }: { where: { uid: { in: string[] } } }) =>
            rows.filter((row) => where.uid.in.includes(row.uid)),
        ),
      } as never,
      {
        toDisplayUrl: jest.fn(async (key: string) => `https://cdn/${key}`),
      } as never,
      {} as never,
      {} as never,
    );

    const [view] = await service.findByProject('proj');

    expect(view.imageUrls).toEqual(['https://cdn/refs/1.png']);
    expect(view.resultUrls).toEqual([
      'https://cdn/results/1.png',
      'https://cdn/results/2.png',
    ]);
  });
});
