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
  /** Provider task id of a Seedance 2.5 draft; set = render that draft at `resolution` */
  draftTaskId?: string;
  resolution: string;
  organizationId?: string;
  /** `duration` (seconds) is sent for video refs so the credit hold counts them */
  files: { type: 'image' | 'video' | 'audio'; url: string; duration?: number }[];
}
