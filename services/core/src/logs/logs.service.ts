import { Injectable } from '@nestjs/common';
import { CreateLogDto } from './dto/create-log.dto';
import { UpdateLogDto } from './dto/update-log.dto';
import { LogRepository, GalleryRepository } from '@ai-media/share';

@Injectable()
export class LogsService {
  constructor(
    private readonly logrepo: LogRepository,
    private readonly galleryRepo: GalleryRepository,
  ) {}
  create(createLogDto: CreateLogDto) {
    return 'This action adds a new log';
  }

  findAll() {
    return `This action returns all logs`;
  }

  async findOne(projectId: string) {
    const data = await this.galleryRepo.findMany({
      where: { projectId: projectId, taskId: { not: null } },
      include: { users: true },
      orderBy: { createdAt: 'asc' },
    });
    const map = new Map();
    for (const item of data) {
      if (!map.has(item.taskId)) {
        map.set(item.taskId, {
          ...item,
          imageUrls: [item.imageUrl],
        });
        delete map.get(item.taskId).imageUrl;
      } else {
        map.get(item.taskId).imageUrls.push(item.imageUrl);
      }
    }

    const result = Array.from(map.values());

    return result;
  }

  update(id: number, updateLogDto: UpdateLogDto) {
    return `This action updates a #${id} log`;
  }

  remove(id: number) {
    return `This action removes a #${id} log`;
  }
}
