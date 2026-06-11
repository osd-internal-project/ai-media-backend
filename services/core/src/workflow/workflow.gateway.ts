import { Injectable, Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

/**
 * Payload ที่ส่งให้ frontend เมื่อสถานะบล็อกเปลี่ยน
 */
export interface WorkflowBlockUpdatePayload {
  blockId: string;
  status: 'pending' | 'processing' | 'success' | 'failed';
  progress?: number; // 0.0–1.0
  outputUrl?: string | null;
  errorMessage?: string | null;
}

/**
 * Gateway แยกสำหรับฟีเจอร์ Workflow โดยเฉพาะ
 *
 * ใช้ path '/websockets' เดียวกับ gateway เดิม → แชร์ socket.io server instance ตัวเดียวกัน
 * จึง emit เข้าห้อง `${projectId}:workflow` ที่ client เข้าร่วมผ่าน handler `join-room` เดิมได้เลย
 * โดยไม่ต้องแก้ไข WebsocketGatewayService เดิม (ไม่ประกาศ handler ซ้ำเพื่อเลี่ยงการชนกัน)
 */
@WebSocketGateway({
  path: '/websockets',
  cors: { origin: '*', credentials: true },
  transports: ['websocket'],
})
@Injectable()
export class WorkflowGateway {
  private readonly logger = new Logger(WorkflowGateway.name);

  @WebSocketServer()
  server: Server;

  /**
   * ส่ง event `workflow.block.updated` เข้าห้องของโปรเจกต์
   * @param projectId รหัสโปรเจกต์ (ใช้ประกอบชื่อห้อง)
   * @param payload ข้อมูลสถานะบล็อกล่าสุด
   */
  emitBlockUpdate(
    projectId: string,
    payload: WorkflowBlockUpdatePayload,
  ): void {
    if (!this.server) {
      this.logger.warn('Socket server not ready, skip workflow.block.updated');
      return;
    }
    const room = `${projectId}:workflow`;
    this.server.to(room).emit('workflow.block.updated', payload);
  }
}
