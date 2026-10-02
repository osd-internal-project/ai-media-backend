import { PhotoEventGenerationStatus } from '../photo-event.constants';

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
