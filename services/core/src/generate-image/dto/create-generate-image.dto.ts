export class CreateGenerateImageDto {
  type: 'image' | 'vdo';
  text: string;
  resolution: string;
  duration: string;
  image?: any;
  ratio: string;
  images: number;
  images_select: number;
  width: number;
  height: number;
  projectId: string;
  userId: string;
  modelName?: string;  // Add optional model name
}
