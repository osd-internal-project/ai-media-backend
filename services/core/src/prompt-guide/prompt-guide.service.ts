import { Injectable } from '@nestjs/common';
import {
  PromptGuideImageRepository,
  PromptGuideRepository,
  StorageUrlService,
} from '@ai-media/share';
import { Prisma, PromptGuide } from '@prisma/client';

export type PromptGuideMedia = {
  uid: string;
  name: string;
  url: string;
  imagePath: string;
  status: string;
  index: number;
};

@Injectable()
export class PromptGuideService {
  constructor(
    private readonly promptguideRepo: PromptGuideRepository,
    private readonly promptGuideImageRepo: PromptGuideImageRepository,
    private readonly storageUrl: StorageUrlService,
  ) {}
  create(createPromptGuideDto: Prisma.PromptGuideCreateInput) {
    const data = {
      ...createPromptGuideDto,
      organizationId: createPromptGuideDto.organizationId || null,
    };
    return this.promptguideRepo.create({ data });
  }

  findAll() {
    return this.promptguideRepo.findMany({});
  }

  findOne(id: number) {
    return this.promptguideRepo.findOne({ where: { id } });
  }

  async update(
    id: number,
    updatePromptGuideDto: Prisma.PromptGuideUpdateInput,
  ) {
    const data = {
      ...updatePromptGuideDto,
      organizationId: updatePromptGuideDto.organizationId || null,
      // คอลัมน์ updated_at ไม่มี @updatedAt ใน schema
      updatedAt: new Date(),
    };

    const updated = await this.promptguideRepo.update({
      where: {
        id,
      },
      data,
    });
    // ต้องเสร็จก่อนตอบกลับ — หน้าเว็บ fetch ใหม่ทันทีและแสดงเฉพาะรูปที่ completed
    // omnihumen/dreamactor ใช้ index 1/2 เป็นช่องตายตัว — เรียงใหม่ตามลำดับอัปโหลดจะสลับช่อง
    const reindexRefs = !FIXED_SLOT_TYPES.includes(updated.generateType);
    await Promise.all([
      this.complete(toUidList(updatePromptGuideDto.promptGuideImages), reindexRefs),
      this.complete(toUidList(updatePromptGuideDto.promptGuideResults), true),
    ]);
    return updated;
  }

  remove(id: number) {
    return this.promptguideRepo.delete({ where: { id } });
  }

  async findByOrganization(organizationId: string, query?: { model?: string }) {
    // guide ที่ไม่ผูก model ใช้ได้กับทุก model — ฟอร์ม admin ส่ง "" เมื่อไม่เลือก จึงนับ "" เป็นไม่ผูกด้วย
    const modelFilter: Prisma.PromptGuideWhereInput = query?.model
      ? { OR: [{ model: query.model }, { model: null }, { model: '' }] }
      : {};
    const promptGuides = await this.promptguideRepo.findMany({
      where: { organizationId, ...modelFilter },
      include: { promptGuideType: true },
    });
    return Promise.all(promptGuides.map((guide) => this.withMedia(guide)));
  }

  async findWithImageByTypes(promptGuideTypeId: number) {
    const promptGuides = await this.promptguideRepo.findMany({
      where: {
        promptGuideTypeId,
      },
    });
    return Promise.all(promptGuides.map((guide) => this.withMedia(guide)));
  }

  async findImagesByPromptGuideId(promptGuideId: number) {
    const resultUids = await this.findResultUids(promptGuideId);
    return this.promptGuideImageRepo.findMany({
      where: {
        promptGuideId,
        status: 'completed',
        uid: { notIn: resultUids },
      },
      orderBy: {
        index: 'asc',
      },
    });
  }

  /** รูป reference ของ guide (ไม่รวมผลลัพธ์) พร้อม display url */
  async getPromptGuideImages(promptGuideId: number) {
    const resultUids = await this.findResultUids(promptGuideId);
    const images = await this.promptGuideImageRepo.findMany({
      where: {
        promptGuideId,
        status: 'completed',
        uid: { notIn: resultUids },
      },
      orderBy: {
        index: 'asc',
      },
    });

    const imagesWithUrls = await Promise.all(
      images.map(async (image) => {
        const url = await this.storageUrl.toDisplayUrl(image.imagePath);
        return {
          uid: image.uid,
          name: image.imageName,
          url: url,
          status: image.status,
          index: image.index,
        };
      }),
    );

    return imagesWithUrls;
  }

  /** ผลลัพธ์ตัวอย่างของ guide ตามลำดับใน promptGuideResults */
  async getPromptGuideResults(promptGuideId: number) {
    return this.resolveMedia(await this.findResultUids(promptGuideId));
  }

  private async findResultUids(promptGuideId: number): Promise<string[]> {
    const guide = await this.promptguideRepo.findOne({
      where: { id: promptGuideId },
      select: { promptGuideResults: true },
    });
    return guide?.promptGuideResults ?? [];
  }

  private async withMedia<T extends PromptGuide>(guide: T) {
    const [images, results] = await Promise.all([
      this.resolveMedia(guide.promptGuideImages),
      this.resolveMedia(guide.promptGuideResults),
    ]);
    return { ...guide, images, results };
  }

  private async resolveMedia(uids: string[]): Promise<PromptGuideMedia[]> {
    if (uids.length === 0) return [];
    const rows = await this.promptGuideImageRepo.findMany({
      where: { uid: { in: uids }, status: 'completed' },
      orderBy: { index: 'asc' },
    });
    return Promise.all(
      rows.map(async (row) => ({
        uid: row.uid,
        name: row.imageName,
        url: await this.storageUrl.toDisplayUrl(row.imagePath),
        imagePath: row.imagePath,
        status: row.status,
        index: row.index,
      })),
    );
  }

  // index เรียงเป็น 1..n ตามลำดับใน list — admin อัปโหลดด้วย index = จำนวนไฟล์
  // จึงซ้ำ/ข้ามได้หลังลบ ทำให้ @imageN ตอน Use ไม่ตรงกับที่ admin เห็น
  private async complete(uids: string[], reindex: boolean) {
    await Promise.all(
      uids.map((uid, i) =>
        this.promptGuideImageRepo.updateMany({
          where: { uid },
          data: reindex
            ? { status: 'completed', index: i + 1 }
            : { status: 'completed' },
        }),
      ),
    );
  }
}

const FIXED_SLOT_TYPES = ['omnihumen', 'dreamactor'];

function toUidList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((uid): uid is string => typeof uid === 'string')
    : [];
}
