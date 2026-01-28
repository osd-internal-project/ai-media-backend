export class ByteplusePayloadImage {
    model: string;
    prompt: string;
    image?: string[];
    size: string;
    sequential_image_generation: string;
    sequential_image_generation_options: {
        max_images: number;
    };
    stream: boolean;
    response_format: "url" | "b64_json";
    seed?: number;
    watermark?: boolean;
    ratio: string;
    image_generate_type: string;
}
