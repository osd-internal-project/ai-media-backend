import { PhotoEventGenerationStatus } from '../photo-event.constants';
import { PrintLayout } from '../photo-event-print-layout';

export interface PhotoEventTemplateView {
  promptGuideId: number;
  title: string;
  description: string | null;
  textPrompt: string;
  /** null = ใช้ defaultPromptTail */
  promptTail: string | null;
  defaultPromptTail: string;
  imageUrls: string[];
  sortOrder: number;
}

export interface PhotoEventGenerationView {
  id: string;
  photoId: string;
  promptGuideId: number;
  templateTitle: string | null;
  status: PhotoEventGenerationStatus;
  progress: number | null;
  resultUrl: string | null;
  errorMessage: string | null;
  createdAt: Date;
}

export interface PhotoEventPhotoView {
  id: string;
  projectId: string;
  imageName: string;
  url: string | null;
  thumbUrl: string | null;
  createdAt: Date;
  generations: PhotoEventGenerationView[];
}

export interface PublicPhotoEventView {
  id: string;
  imageUrl: string;
  createdAt: Date;
}

export interface PhotoEventPrintTemplateView {
  id: string;
  name: string;
  isActive: boolean;
  layout: PrintLayout;
  /** storage key → presigned URL ของพื้นหลัง/icon/กรอบใน layout */
  assetUrls: Record<string, string>;
  updatedAt: Date;
}

export interface PhotoEventPrintAssetView {
  key: string;
  url: string | null;
}
