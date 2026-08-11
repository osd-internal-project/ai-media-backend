import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  COMMUNITY_SCHEDULE_BATCH_SIZE,
  COMMUNITY_SCHEDULE_GRACE_MINUTES,
} from '@ai-media/share';
import { CommunityPostService } from './community-post.service';

/**
 * เผยแพร่โพสต์ที่ตั้งเวลาไว้เมื่อถึงกำหนด
 *
 * ทำไมเป็น cron ไม่ใช่ BullMQ delayed job อย่างงาน social publish:
 * ปลายทางของ Communication คือ DB ของเราเอง การเผยแพร่จึงเป็นแค่การเปลี่ยนสถานะ
 * ไม่มี provider ให้รอและไม่มีอะไรให้ retry เป็นรายปลายทาง ส่วน delayed job ต้อง
 * ตามลบ/สร้างใหม่ทุกครั้งที่ผู้ใช้เลื่อนหรือยกเลิกเวลา ขณะที่ cron อ่านสถานะจริง
 * จาก DB ทุกนาที จึงถูกต้องเองหลัง restart โดยไม่ต้องซ่อมคิว
 *
 * อยู่ใน core ไม่ใช่ worker-service เพราะ worker-service ยังไม่ได้เรียก
 * ScheduleModule.forRoot() (@Cron ที่นั่นจึงไม่ทำงาน) และเพราะ state machine
 * กับการเขียน log อยู่ใน CommunityPostService ที่นี่อยู่แล้ว
 */
@Injectable()
export class CommunityScheduleCron {
  private readonly logger = new Logger(CommunityScheduleCron.name);

  constructor(private readonly communityPostService: CommunityPostService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async publishDuePosts(): Promise<void> {
    try {
      const { published, skipped } =
        await this.communityPostService.publishDueScheduled(
          new Date(),
          COMMUNITY_SCHEDULE_GRACE_MINUTES,
          COMMUNITY_SCHEDULE_BATCH_SIZE,
        );

      // เงียบเมื่อไม่มีอะไรให้ทำ — cron นี้เดินทุกนาที ไม่ควรถม log
      if (published > 0 || skipped > 0) {
        this.logger.log(
          `community scheduled publish: ${published} published, ${skipped} skipped`,
        );
      }
    } catch (error) {
      // cron ที่โยน error ทิ้งไว้จะกลายเป็น unhandled rejection — จับไว้เองแล้ว
      // ปล่อยให้รอบถัดไปลองใหม่
      this.logger.error(
        `community schedule cron failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
