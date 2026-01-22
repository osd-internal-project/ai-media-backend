export class CreateGenerateDto {
    taskId?: string;
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
    modelName?: string; // Add optional model name
    generateAudio?: boolean;
    generateConfig?: any;
}

export const QUEUE_NAME_IMAGE = 'image-generate-queue';
export const QUEUE_NAME_VDO = 'vdo-generate-queue';