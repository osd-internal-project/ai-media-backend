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
  response_format: 'url' | 'b64_json';
  seed?: number;
  watermark?: boolean;
  ratio: string;
  image_generate_type: string;
}

export class ByteplusePayloadVideo {
  model: string;
  content: [
    {
      type: 'text';
      text: string;
    },
    {
      type: 'image_url';
      image_url: {
        url: string;
      };
      role: 'first_frame';
    },
    {
      type: 'image_url';
      image_url: {
        url: string;
      };
      role: 'last_frame';
    },
  ];
  draft: boolean;
  generate_audio: boolean;
  ratio: string;
  duration: number;
  watermark: boolean;
}

export class ByteplusePayloadOmnihumen {
  req_key: string;
  image_url: string;
  audio_url: string;
}
