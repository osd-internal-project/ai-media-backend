/**
 * ความสามารถของแต่ละ model (ตาม sendConfig.type) ในการรับ output ของบล็อกต้นทาง
 * ต้องตรงกับ frontend `tabs/workflow/workflow-capabilities.ts` และ builder ใน worker
 */
export type ParentKind = 'image' | 'video';

interface ModelCapability {
  blockType: ParentKind;
  acceptsParent: ParentKind[];
  /** none = reference เสมอ, only = first/last frame เท่านั้น, optional = seedance2 เลือกโหมดเดียวต่อคำขอ */
  frames: 'none' | 'only' | 'optional';
  /** จำนวน input สูงสุด (parent + upload) */
  maxInputs: number;
}

const MODEL_CAPABILITIES: Readonly<Record<string, ModelCapability>> = {
  seedream1: {
    blockType: 'image',
    acceptsParent: ['image'],
    frames: 'none',
    maxInputs: 8,
  },
  seedream2: {
    blockType: 'image',
    acceptsParent: ['image'],
    frames: 'none',
    maxInputs: 10,
  },
  seedance1: {
    blockType: 'video',
    acceptsParent: ['image'],
    frames: 'only',
    maxInputs: 2,
  },
  seedance2: {
    blockType: 'video',
    acceptsParent: ['image', 'video'],
    frames: 'optional',
    maxInputs: 8,
  },
};

export type ParentPlan =
  | { ok: true; mode: 'reference' | 'frames' }
  | { ok: false; reason: string };

/**
 * ตัดสินว่าจะส่ง parent ให้ model แบบไหน หรือรับไม่ได้เพราะอะไร
 * @param sendType sendConfig.type ของ model
 * @param parentKinds ชนิด output ของบล็อกต้นทางแต่ละตัว
 * @param uploadCount จำนวนไฟล์ที่ผู้ใช้อัปโหลดเอง
 */
export function planParents(
  sendType: string | undefined,
  parentKinds: ParentKind[],
  uploadCount: number,
): ParentPlan {
  if (parentKinds.length === 0) return { ok: true, mode: 'reference' };
  const cap = sendType ? MODEL_CAPABILITIES[sendType] : undefined;
  if (!cap) {
    return { ok: false, reason: 'This model cannot take input from other blocks' };
  }
  const unsupported = parentKinds.find((k) => !cap.acceptsParent.includes(k));
  if (unsupported) {
    return { ok: false, reason: `This model does not accept ${unsupported} input` };
  }
  const total = parentKinds.length + uploadCount;
  if (total > cap.maxInputs) {
    return {
      ok: false,
      reason: `This model accepts at most ${cap.maxInputs} inputs (got ${total})`,
    };
  }
  if (cap.frames === 'only') return { ok: true, mode: 'frames' };
  if (
    cap.frames === 'optional' &&
    uploadCount === 0 &&
    parentKinds.length <= 2 &&
    parentKinds.every((k) => k === 'image')
  ) {
    return { ok: true, mode: 'frames' };
  }
  return { ok: true, mode: 'reference' };
}
