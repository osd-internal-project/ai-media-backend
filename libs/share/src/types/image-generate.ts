export class RequestImageGenerateDto {
    model: string;
    prompt: string;
    image: string[];
    sequentialImageGeneration: string;
    size: string;
    maxImages: number;
    watermark: boolean;
    type: string;
    ratio: string;
    projectId: string;
    userId: string;
    width: number;
    height: number;
}