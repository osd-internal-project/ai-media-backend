import { IS_PUBLIC_KEY } from '@ai-media/share';
import { AnnouncementController } from './announcement/announcement.controller';
import { PublicAnnouncementController } from './announcement/public-announcement.controller';
import { ByteplusWebhookController } from './byteplus-webhook/byteplus-webhook.controller';
import { PhotoEventController } from './photo-event/photo-event.controller';
import { PublicPhotoEventController } from './photo-event/public-photo-event.controller';
import { PublicCommunityController } from './public-community/public-community.controller';
import { WebsocketController } from './websocket/websocket.controller';

/** route ที่ต้องเปิดเมื่อ AUTH_MODE=enforce — ถ้าใครลบ @Public() ออก webhook / หน้า public จะพังทันที */
describe('core @Public routes', () => {
  it.each([
    ['PublicCommunityController', PublicCommunityController],
    ['PublicPhotoEventController', PublicPhotoEventController],
    ['PublicAnnouncementController', PublicAnnouncementController],
    ['ByteplusWebhookController', ByteplusWebhookController],
    ['WebsocketController (internal key)', WebsocketController],
  ])('%s is public', (_name, controller) => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, controller)).toBe(true);
  });

  it('authenticated controllers are not public', () => {
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, PhotoEventController),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, AnnouncementController),
    ).toBeUndefined();
  });
});
