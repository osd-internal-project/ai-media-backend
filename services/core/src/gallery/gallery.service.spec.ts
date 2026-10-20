import { GalleryService } from './gallery.service';

describe('GalleryService.downloadFile', () => {
  const row = {
    id: 'g1',
    projectId: 'p1',
    typeGenerate: 'image',
    resultUrl: ['a.jpg', 'b.jpg', 'c.jpg'],
    imageUrl: 'a.jpg',
  };
  let toDownloadUrl: jest.Mock;
  let service: GalleryService;

  beforeEach(() => {
    toDownloadUrl = jest.fn().mockResolvedValue('https://signed');
    service = new GalleryService(
      { findOne: jest.fn().mockResolvedValue(row) } as never,
      { toDownloadUrl } as never,
    );
  });

  const downloadedKey = () => toDownloadUrl.mock.calls[0][0] as string;

  it('downloads the image the filename names, not always the first one', async () => {
    await service.downloadFile('g1', { organizationId: 'o1', filename: 'c.jpg' });
    expect(downloadedKey()).toMatch(/c\.jpg$/);
  });

  it('falls back to the first file when the filename is not in the row', async () => {
    await service.downloadFile('g1', {
      organizationId: 'o1',
      filename: '../other/secret.jpg',
    });
    expect(downloadedKey()).toMatch(/a\.jpg$/);
  });
});
