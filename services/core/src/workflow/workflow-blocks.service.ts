import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  MasterdataModelTypeRepository,
  WorkflowBlockRepository,
  WorkflowConversationRepository,
} from '@ai-media/share';
import { Prisma, WorkflowBlock } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { GenerateService } from '../generate/services/generate.service';
import { CreateBlockDto } from './dto/create-block.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { ParentKind, ParentPlan, planParents } from './workflow-capabilities';
import { WorkflowMediaService } from './workflow-media.service';

/**
 * จัดการ WorkflowBlock — แต่ละบล็อกคือหนึ่งงาน generate
 *
 * แนวทาง: ไม่สร้างคิว BullMQ ใหม่ แต่ "reuse pipeline เดิม" โดยเรียก GenerateService
 * (createImageGenerationTask / createVideoGenerationTask) เส้นทาง credit → queue →
 * worker → log/gallery → websocket ทั้งหมดถูกใช้ซ้ำ worker-service ไม่ถูกแก้ไขเลย
 * การ map กลับมายังบล็อกทำผ่าน taskId ใน WorkflowEventsService
 */
@Injectable()
export class WorkflowBlocksService {
  private readonly logger = new Logger(WorkflowBlocksService.name);

  constructor(
    private readonly blockRepo: WorkflowBlockRepository,
    private readonly conversationRepo: WorkflowConversationRepository,
    private readonly generateService: GenerateService,
    private readonly mediaService: WorkflowMediaService,
    private readonly modelTypeRepo: MasterdataModelTypeRepository,
  ) {}

  /**
   * สร้างบล็อกใหม่ในสถานะ pending แล้ว enqueue งานเข้า pipeline เดิมทันที
   * คืนบล็อกกลับทันที (ไม่รอผลงาน generate)
   * @param conversationId รหัส conversation ที่บล็อกสังกัด
   * @param dto ข้อมูลบล็อก + generateConfig (payload แบบเดียวกับฟอร์มเดิม)
   */
  async createBlock(
    conversationId: string,
    dto: CreateBlockDto,
  ): Promise<WorkflowBlock> {
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId },
    });
    if (!conversation) {
      throw new NotFoundException(
        `Workflow conversation ${conversationId} not found`,
      );
    }

    const taskId = uuidv4();
    const parentBlockIds = dto.parentBlockIds ?? [];

    // ตรวจก่อนสร้าง — model ที่รับ parent ไม่ได้ต้องตอบ 400 ไม่ใช่ปล่อยให้ provider พัง
    const plan = await this.planFor(
      dto.model,
      dto.type,
      parentBlockIds,
      (dto.generateConfig ?? {}) as Record<string, any>,
    );
    if ('reason' in plan) throw new BadRequestException(plan.reason);

    const block = await this.blockRepo.create({
      data: {
        workflowConversationId: conversationId,
        parentBlockIds,
        type: dto.type,
        status: 'pending',
        prompt: dto.prompt,
        model: dto.model,
        resolution: dto.resolution,
        generateConfig: dto.generateConfig as Prisma.InputJsonValue,
        taskId,
        positionX: dto.positionX,
        positionY: dto.positionY,
      },
    });

    return this.dispatch(block, conversation.projectId);
  }

  /**
   * อัปเดตตำแหน่งบล็อกบนแคนวาส (เรียกจากการลากการ์ด debounce ฝั่ง frontend)
   */
  async updatePosition(blockId: string, dto: UpdatePositionDto) {
    await this.ensureBlock(blockId);
    return this.blockRepo.update({
      where: { id: blockId },
      data: { positionX: dto.positionX, positionY: dto.positionY },
    });
  }

  /**
   * ลบบล็อก
   */
  async deleteBlock(blockId: string) {
    await this.ensureBlock(blockId);
    await this.blockRepo.delete({ where: { id: blockId } });
    return { success: true };
  }

  /**
   * สั่งรันบล็อกซ้ำ — อนุญาตเฉพาะสถานะ "failed" หรือ "success"
   * รีเซ็ตเป็น pending สร้าง taskId ใหม่ แล้ว enqueue เข้า pipeline เดิมอีกครั้ง
   */
  async retryBlock(blockId: string): Promise<WorkflowBlock> {
    const block = await this.ensureBlock(blockId);
    if (block.status !== 'failed' && block.status !== 'success') {
      throw new BadRequestException(
        `Retry allowed only for failed|success blocks (current: ${block.status})`,
      );
    }

    const conversation = await this.conversationRepo.findOne({
      where: { id: block.workflowConversationId },
    });
    if (!conversation) {
      throw new NotFoundException('Parent conversation not found');
    }

    const taskId = uuidv4();
    const reset = await this.blockRepo.update({
      where: { id: blockId },
      data: {
        status: 'pending',
        taskId,
        outputUrl: null,
        errorMessage: null,
        duration: null,
      },
    });

    return this.dispatch(reset, conversation.projectId);
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  /**
   * ตรวจว่ามีบล็อกอยู่จริง คืนข้อมูลบล็อก
   */
  private async ensureBlock(blockId: string): Promise<WorkflowBlock> {
    const block = await this.blockRepo.findOne({ where: { id: blockId } });
    if (!block) {
      throw new NotFoundException(`Workflow block ${blockId} not found`);
    }
    return block;
  }

  /**
   * ประกอบ body แล้วส่งงานเข้า GenerateService เดิม
   * - แนบ output ของบล็อกต้นทางเป็น reference image/file
   * - สำเร็จ: ตั้งสถานะบล็อกเป็น "processing"
   * - ล้มเหลว (enqueue ไม่ผ่าน): ตั้งสถานะ "failed" พร้อม errorMessage
   */
  private async dispatch(
    block: WorkflowBlock,
    projectId: string,
  ): Promise<WorkflowBlock> {
    const clientId = `workflow:${block.workflowConversationId}`;
    try {
      const body = await this.buildGenerateBody(block, projectId);

      const result =
        block.type === 'image'
          ? await this.generateService.createImageGenerationTask(body, clientId)
          : await this.generateService.createVideoGenerationTask(
              body,
              clientId,
            );

      if (!result || result.status !== 200) {
        return this.markFailed(block.id, this.stringifyError(result?.data));
      }

      // มีเงื่อนไข pending — worker ที่เร็วอาจส่ง success/error มาก่อนบรรทัดนี้
      await this.blockRepo.updateMany({
        where: { id: block.id, status: 'pending' },
        data: { status: 'processing' },
      });
      return this.ensureBlock(block.id);
    } catch (error) {
      this.logger.error(
        `Failed to dispatch workflow block ${block.id}: ${this.stringifyError(
          error,
        )}`,
      );
      return this.markFailed(block.id, this.stringifyError(error));
    }
  }

  /**
   * ประกอบ body ที่ส่งให้ pipeline เดิม โดยใช้ generateConfig ของบล็อกเป็นฐาน
   * แล้ว override taskId/projectId และแนบ reference จากบล็อกต้นทาง
   */
  private async buildGenerateBody(
    block: WorkflowBlock,
    projectId: string,
  ): Promise<Record<string, any>> {
    // generateConfig เป็น passthrough payload จากฟอร์มเดิม — cast เป็น any เพื่อประกอบต่อ
    const config = (block.generateConfig ?? {}) as Record<string, any>;
    const parentOutputs = await this.collectParentOutputs(block.parentBlockIds);

    const body: Record<string, any> = {
      ...config,
      taskId: block.taskId,
      projectId,
      model: block.model,
      prompt: block.prompt,
      resolution: block.resolution,
    };

    if (block.parentBlockIds.length === 0) return body;
    // parent ที่ยังไม่มี output (เช่นถูก retry อยู่) — fail ให้เห็น ไม่ทิ้ง reference เงียบ ๆ
    if (parentOutputs.length < block.parentBlockIds.length) {
      throw new Error('A parent block has no output yet');
    }

    const plan = await this.planFor(
      block.model,
      block.type,
      block.parentBlockIds,
      config,
    );
    if ('reason' in plan) throw new Error(plan.reason);

    // สร้าง canonical key ของ output บล็อกต้นทาง (ไม่ presign) → worker presign เองตอนยิง provider
    // ผลลัพธ์: reference_images ที่ worker บันทึกเป็น key ถาวร organize/.../{type}-generate/{obj}
    // แทน presigned URL ที่หมดอายุ
    const keyedParents = await Promise.all(
      parentOutputs.map(async (p) => ({
        type: p.type,
        url: await this.mediaService.buildObjectKey(
          projectId,
          p.type,
          p.objectName,
        ),
      })),
    );
    const validParents = keyedParents.filter(
      (p): p is { type: string; url: string } => Boolean(p.url),
    );

    return { ...body, ...this.attachParents(block.type, plan, config, validParents) };
  }

  /**
   * ใส่ output ของ parent ลงช่องที่ model ใช้จริงตาม plan
   * - image: reference ต่อท้าย image[]
   * - video frames: parent เป็น first frame ก่อน แล้วตามด้วยเฟรมที่ผู้ใช้อัปโหลด
   * - video reference: ทุกอย่างไป files[] (seedance2 ห้ามผสม frame กับ reference)
   */
  private attachParents(
    type: string,
    plan: Extract<ParentPlan, { ok: true }>,
    config: Record<string, any>,
    parents: { type: string; url: string }[],
  ): { image: string[]; files?: { type: string; url: string }[] } {
    const configImages: string[] = Array.isArray(config.image)
      ? config.image.filter(Boolean)
      : [];
    const configFiles: { type: string; url: string }[] = Array.isArray(
      config.files,
    )
      ? config.files
      : [];

    if (type === 'image') {
      return { image: [...configImages, ...parents.map((p) => p.url)] };
    }
    if (plan.mode === 'frames') {
      return { image: [...parents.map((p) => p.url), ...configImages] };
    }
    return {
      image: [],
      files: [
        ...configImages.map((url) => ({ type: 'image', url })),
        ...configFiles,
        ...parents.map((p) => ({ type: p.type, url: p.url })),
      ],
    };
  }

  /**
   * หา plan การส่ง parent จาก model + ชนิดของบล็อกต้นทาง
   */
  private async planFor(
    modelType: string,
    blockType: string,
    parentBlockIds: string[],
    config: Record<string, any>,
  ): Promise<ParentPlan> {
    if (parentBlockIds.length === 0) return { ok: true, mode: 'reference' };
    const [model, parents] = await Promise.all([
      this.modelTypeRepo.findOne({
        where: { modelType, type: blockType, isActive: true },
      }),
      this.blockRepo.findMany({ where: { id: { in: parentBlockIds } } }),
    ]);
    if (parents.length !== parentBlockIds.length) {
      return { ok: false, reason: 'A parent block no longer exists' };
    }
    // sendConfig เป็น Json ของ Prisma — อ่านเฉพาะ field type
    const sendType = (model?.sendConfig as { type?: string } | null)?.type;
    const uploads =
      (Array.isArray(config.image) ? config.image.filter(Boolean).length : 0) +
      (Array.isArray(config.files) ? config.files.length : 0);
    return planParents(
      sendType,
      // คอลัมน์ type เป็น varchar แต่บล็อกถูกสร้างจาก DTO ที่จำกัดเป็น image|video
      parents.map((p) => p.type as ParentKind),
      uploads,
    );
  }

  /**
   * ดึง output ของบล็อกต้นทางที่ generate สำเร็จแล้ว พร้อมชนิด (image/video)
   * outputUrl ที่เก็บไว้คือ object name ดิบ → ใช้เป็น reference ให้ pipeline เดิมได้ตรง ๆ
   */
  private async collectParentOutputs(
    parentBlockIds: string[],
  ): Promise<{ type: string; objectName: string }[]> {
    if (!parentBlockIds || parentBlockIds.length === 0) return [];
    const parents = await this.blockRepo.findMany({
      where: { id: { in: parentBlockIds } },
    });
    return parents
      .filter((p) => Boolean(p.outputUrl))
      .map((p) => ({ type: p.type, objectName: p.outputUrl as string }));
  }

  /**
   * ตั้งสถานะบล็อกเป็น failed พร้อมข้อความ error
   */
  private async markFailed(
    blockId: string,
    message: string,
  ): Promise<WorkflowBlock> {
    return this.blockRepo.update({
      where: { id: blockId },
      data: { status: 'failed', errorMessage: message },
    });
  }

  /**
   * แปลง error/payload ที่ไม่แน่ใจชนิดให้เป็นข้อความ
   */
  private stringifyError(value: unknown): string {
    if (value instanceof Error) return value.message;
    if (typeof value === 'string') return value;
    if (value == null) return 'Unknown error';
    return JSON.stringify(value);
  }
}
