import { Injectable } from '@nestjs/common';
import { CreateDashboardDto } from './dto/create-dashboard.dto';
import { UpdateDashboardDto } from './dto/update-dashboard.dto';
import { generateExcelBuffer } from 'src/utils/excel';
import dayjs from 'dayjs';
import { LogRepository, UsersRepository } from '@ai-media/share';

@Injectable()
export class DashboardService {
  constructor(
    private readonly logRepo: LogRepository,
    private readonly userRepo: UsersRepository,
  ) {}
  create(createDashboardDto: CreateDashboardDto) {
    return 'This action adds a new dashboard';
  }

  findAll() {
    return `This action returns all dashboard`;
  }
  async testExport(query: any, subject: string) {
    const { createdAt, projectId, token } = query || {};
    const findUser = await this.userRepo.findOne({ where: { token } });
    const dataLogs = await this.logRepo.findMany({
      where: {
        userId: findUser.userId,
        status: 'success',
        taskId: { not: null },
        ...(projectId && { projectId: projectId }),
        ...(createdAt && {
          createdAt: {
            gte: dayjs(createdAt).startOf('month').toDate(),
            lte: dayjs(createdAt).endOf('month').toDate(),
          },
        }),
      },
      include: {
        users: true,
      },
    });
    const result = Object.values(
      dataLogs.reduce((products, log: any) => {
        const product = log.typeGenerate;
        if (!products[product]) {
          products[product] = {
            type: product,
            totalImageUsed: 0,
            totalTokenUsed: 0,
            unitPrice:
              product === 'image' ? 0.03 : product === 'vdo' ? 0.0025 : null,
          };
        }
        const group = products[product];
        if (product === 'image') {
          group.totalImageUsed += log.ImageUsed ?? 0;
        }
        if (product === 'vdo') {
          group.totalTokenUsed += log.tokenUsed ?? 0;
        }
        return products;
      }, {}),
    );
    return generateExcelBuffer(result, subject);
  }
  findOne(id: number) {
    return `This action returns a #${id} dashboard`;
  }

  update(id: number, updateDashboardDto: UpdateDashboardDto) {
    return `This action updates a #${id} dashboard`;
  }

  remove(id: number) {
    return `This action removes a #${id} dashboard`;
  }
}
