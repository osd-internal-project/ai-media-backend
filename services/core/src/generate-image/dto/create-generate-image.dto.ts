export class CreateGenerateImageDto {
  type: 'image' | 'vdo';
  text: string;
  resolution: string;
  duration: string;
  image?: any;
  ratio: string;
}
