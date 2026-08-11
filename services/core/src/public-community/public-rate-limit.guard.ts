import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';

/** จำนวนคำขอสูงสุดต่อ IP ต่อหน้าต่างเวลา */
const MAX_REQUESTS_PER_WINDOW = 60;

/** ความยาวหน้าต่างเวลา (มิลลิวินาที) */
const WINDOW_MS = 60_000;

/** จำนวน IP สูงสุดที่จำไว้ — กัน map โตไม่จำกัดเมื่อโดนยิงจากหลาย IP */
const MAX_TRACKED_KEYS = 50_000;

/**
 * rate limit อย่างง่ายสำหรับ endpoint สาธารณะที่เขียนข้อมูล (view / like)
 *
 * ตั้งใจทำเป็น in-memory ไม่พึ่ง dependency ใหม่ ข้อจำกัดที่ต้องรู้:
 * นับแยกกันในแต่ละ pod ดังนั้นเพดานจริงคือ MAX_REQUESTS_PER_WINDOW × จำนวน replica
 * เพียงพอกับการกันสคริปต์ปั๊มยอดแบบง่าย ๆ แต่ไม่ใช่การป้องกันระดับ DDoS
 * (ชั้นนั้นควรอยู่ที่ ingress/WAF) ถ้าต้องการเพดานที่แม่นข้าม pod ให้ย้ายไปใช้
 * @nestjs/throttler + storage บน Redis ที่มีอยู่แล้วในระบบ
 */
@Injectable()
export class PublicRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(PublicRateLimitGuard.name);
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const key = this.resolveClientKey(request);
    const now = Date.now();

    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.evictIfNeeded();
      this.hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return true;
    }

    entry.count += 1;
    if (entry.count > MAX_REQUESTS_PER_WINDOW) {
      throw new HttpException(
        'Too many requests, please slow down',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  /**
   * หา key ที่ใช้นับต่อผู้เรียก 1 ราย
   *
   * x-forwarded-for อาจเป็น list เมื่อผ่าน proxy หลายชั้น — เอาตัวแรกซึ่งเป็น
   * client จริง (ค่านี้ปลอมได้ แต่ชั้นนี้ไม่ใช่กลไกความปลอดภัย)
   *
   * @param request request ที่เข้ามา
   * @returns key สำหรับนับ
   */
  private resolveClientKey(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const ip = raw?.split(',')[0]?.trim() || request.socket.remoteAddress || 'unknown';
    return ip;
  }

  /**
   * ล้างรายการที่หมดอายุเมื่อ map ใหญ่เกินเพดาน
   *
   * เรียกเฉพาะตอนจะเพิ่ม key ใหม่ เพื่อไม่ให้ทุกรีเควสต์ต้องเดินทั้ง map
   */
  private evictIfNeeded(): void {
    if (this.hits.size < MAX_TRACKED_KEYS) return;

    const now = Date.now();
    for (const [key, entry] of this.hits) {
      if (entry.resetAt <= now) this.hits.delete(key);
    }
    // ยังเต็มอยู่แปลว่าโดนยิงจริง — ทิ้งทั้งหมดดีกว่าปล่อยให้กิน memory ไม่จำกัด
    if (this.hits.size >= MAX_TRACKED_KEYS) {
      this.logger.warn(
        `rate limit map hit ${MAX_TRACKED_KEYS} live keys — clearing`,
      );
      this.hits.clear();
    }
  }
}
