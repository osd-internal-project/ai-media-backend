export class RequestVideoGenerateDto {
  taskId: string;
  model: string;
  prompt: string;
  image: string[]; // Can be empty or contain initial image
  sequentialImageGeneration: string;
  size: string;
  maxImages: number;
  watermark: boolean;
  duration: number; // e.g. "5s", "10s"
  ratio: string;
  projectId: string;
  userId: string;
  width: number;
  height: number;
  imageGenerateType: string;
  typeGenerate: string;
  generateAudio: boolean;
  draft: boolean;
  resolution: string;
  organizationId?: string;
  files: { type: 'image' | 'video' | 'audio'; url: string }[];
}
