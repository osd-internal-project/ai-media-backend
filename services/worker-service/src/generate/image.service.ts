import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import {
    QUEUE_NAME_IMAGE,
} from '@ai-media/share';

// บอกว่า Class นี้รับผิดชอบคิวชื่อ 'image-Image-queue'
// concurrency: 5 คือ ทำพร้อมกันได้ 5 งาน (ถ้าเครื่องไหว)
@Processor(QUEUE_NAME_IMAGE, { concurrency: 5 })
export class ImageProcessor extends WorkerHost {
    private readonly logger = new Logger(ImageProcessor.name);

    // ฟังก์ชันนี้จะถูกเรียกอัตโนมัติเมื่อมีงานเข้า Queue
    async process(job: Job<any, any, string>): Promise<any> {
        const { userId, prompt, jobId } = job.data;
        this.logger.log(`👨‍🍳 Chef is cooking job: ${job.id} | Prompt: ${prompt}`);

        try {
            // --- STEP 1: เรียก AI Model (สมมติว่าใช้เวลานาน) ---
            // const imageBuffer = await this.aiService.generate(prompt);
            const imageBuffer = await this.mockAiImage(prompt);

            // --- STEP 2: อัปโหลดขึ้น MinIO ---
            // const url = await this.minioService.upload(imageBuffer);
            const url = `https://minio.example.com/images/${jobId}.png`;

            // --- STEP 3: แจ้งเตือน User (WebSocket / Update DB) ---
            this.logger.log(`✅ Finished! URL: ${url}`);
            // await this.dbService.updateStatus(jobId, 'COMPLETED', url);
            // await this.socketGateway.emitToUser(userId, 'Image_done', { url });

            return { success: true, url };

        } catch (error) {
            this.logger.error(`❌ Job failed: ${error.message}`);
            throw error; // Throw เพื่อให้ BullMQ รู้ว่า Fail (จะได้ Retry ตามที่ตั้งไว้)
        }
    }

    // ฟังก์ชันจำลอง AI หน่วงเวลา 5 วินาที
    private async mockAiImage(prompt: string) {
        return new Promise((resolve) => setTimeout(resolve, 5000));
    }
}