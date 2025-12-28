import { Test, TestingModule } from '@nestjs/testing';
import { GenerateImageService } from './generate-image.service';
import {
  GenerateImageRepository,
  LogRepository,
  GalleryRepository,
  MasterdataModelTypeRepository,
  MasterDataConfigApiRepository,
  UsersRepository,
} from '@ai-media/share';
import { MinioClientService } from 'src/minio-client/minio-client.service';
import axios from 'axios';

// Mock axios methods
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GenerateImageService', () => {
  let service: GenerateImageService;
  let logRepo: LogRepository;
  let galleryRepo: GalleryRepository;
  let minioService: MinioClientService;

  const mockLogRepo = {
    findOne: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  const mockGalleryRepo = {
    create: jest.fn(),
  };

  const mockMinioService = {
    uploadFile: jest.fn(),
  };

  const mockGenerateImageRepo = {
    create: jest.fn(),
  };

  const mockModelTypeRepo = {};
  const mockConfigApiRepo = {};
  const mockUserRepo = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GenerateImageService,
        { provide: LogRepository, useValue: mockLogRepo },
        { provide: GalleryRepository, useValue: mockGalleryRepo },
        { provide: MinioClientService, useValue: mockMinioService },
        { provide: GenerateImageRepository, useValue: mockGenerateImageRepo },
        { provide: MasterdataModelTypeRepository, useValue: mockModelTypeRepo },
        { provide: MasterDataConfigApiRepository, useValue: mockConfigApiRepo },
        { provide: UsersRepository, useValue: mockUserRepo },
      ],
    }).compile();

    service = module.get<GenerateImageService>(GenerateImageService);
    logRepo = module.get<LogRepository>(LogRepository);
    galleryRepo = module.get<GalleryRepository>(GalleryRepository);
    minioService = module.get<MinioClientService>(MinioClientService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOne', () => {
    it('should find detailed task and process video upload', async () => {
      const taskId = 'test-task-id';
      const mockLogData = {
        taskId: taskId,
        projectId: 'proj-1',
        userId: 'user-1',
        prompt: 'test prompt',
      };

      // Mock database response
      mockLogRepo.findOne.mockResolvedValue(mockLogData);

      // Mock external API response (success)
      const mockApiResponse = {
        data: {
          id: taskId,
          status: 'succeeded',
          content: {
            video_url: 'http://192.168.31.181:9011/api/vdo/cgt-20251216170127-j7557%2Ff03d97d2-7936-4102-bb91-625fc1ecf21c.mp4',
          },
        },
      };
      mockedAxios.get.mockResolvedValueOnce(mockApiResponse);

      // Mock video file download
      const mockVideoBuffer = Buffer.from('video-content');
      mockedAxios.get.mockResolvedValueOnce({
        data: mockVideoBuffer,
      });

      // Mock generateThumbnailFromBuffer (private method workaround or mock implementation)
      // Since it uses exec/ffmpeg which is hard to test in unit test without heavy mocking, 
      // we can spy on it if we want to avoid actual execution, or better, 
      // accepted that for this unit test we might need to mock internal implementation 
      // OR mostly just focus on the flow. 
      // For now, let's mock the private method to avoid ffmpeg dependency in test environment
      jest.spyOn(service as any, 'generateThumbnailFromBuffer').mockResolvedValue(Buffer.from('thumb-content'));

      await service.findOne(taskId);

      // Verify logRepo called
      expect(mockLogRepo.findOne).toHaveBeenCalledWith({ where: { taskId: taskId } });

      // Verify MinIO upload called for video (this was the bug fix)
      expect(minioService.uploadFile).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(Number),
        undefined, // bucket name
        expect.stringContaining(taskId)
      );

      // Verify Gallery creation
      expect(galleryRepo.create).toHaveBeenCalled();
    });
  });
});
