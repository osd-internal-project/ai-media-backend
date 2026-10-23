import { AnnouncementCategory } from './save-announcement.dto';

/** payload ที่ออกจาก API ทั้งฝั่ง admin และ public — ไม่มี image_key ดิบ */
export interface AnnouncementView {
  id: string;
  category: AnnouncementCategory;
  title: string;
  body: string | null;
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}
