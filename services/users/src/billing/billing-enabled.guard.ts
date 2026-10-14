import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import configs from '../configs';

/**
 * ปิดทุกช่องทางที่เรียก Omise (ซื้อ / จ่าย invoice / บัตร / webhook) เมื่อ `BILLING_ENABLED` ไม่ใช่ `true`
 * — ตอนนี้ org ถูกสร้างโดย admin เท่านั้น จึงไม่มีการรับชำระเงินผ่านระบบ
 */
@Injectable()
export class BillingEnabledGuard implements CanActivate {
  canActivate(): boolean {
    if (!configs().billingEnabled) {
      // 404 ไม่ใช่ 403 — ไม่บอกว่า endpoint นี้มีอยู่
      throw new NotFoundException();
    }
    return true;
  }
}
