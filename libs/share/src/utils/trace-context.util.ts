import {
  Attributes,
  context,
  Link,
  propagation,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';

/** W3C trace context (traceparent/tracestate) ที่แนบไปกับ job data / pub-sub message */
export type TraceCarrier = Record<string, string>;

/** key ใน job.data / message ที่เก็บ TraceCarrier */
export const TRACE_CARRIER_KEY = '_otel';

const TRACER_NAME = '@ai-media/share';

function toCarrier(value: unknown): TraceCarrier {
  if (!value || typeof value !== 'object') return {};
  const carrier: TraceCarrier = {};
  for (const [key, val] of Object.entries(value)) {
    if (typeof val === 'string') carrier[key] = val;
  }
  return carrier;
}

/**
 * ดึง context ปัจจุบันเป็น carrier สำหรับส่งข้าม queue / pub-sub
 * คืน {} เมื่อไม่มี span ที่ active หรือ OTel ปิดอยู่
 */
export function injectTraceContext(): TraceCarrier {
  const carrier: TraceCarrier = {};
  propagation.inject(context.active(), carrier);
  return carrier;
}

/** อ่าน carrier จาก `data[TRACE_CARRIER_KEY]` (job data / message ที่ parse แล้ว) */
export function readTraceCarrier(data: unknown): TraceCarrier {
  if (!data || typeof data !== 'object') return {};
  return toCarrier((data as Record<string, unknown>)[TRACE_CARRIER_KEY]);
}

/** span link ไปยัง trace ใน carrier — ใช้เมื่อ parent จริงเป็นคนละ trace (เช่น callback จากภายนอก) */
export function linksFromCarrier(carrier: unknown): Link[] {
  // extract จาก ROOT_CONTEXT — ถ้าใช้ context.active() carrier ว่างจะได้ span ปัจจุบันกลับมา (link หาตัวเอง)
  const extracted = propagation.extract(ROOT_CONTEXT, toCarrier(carrier));
  const spanContext = trace.getSpanContext(extracted);
  return spanContext && trace.isSpanContextValid(spanContext)
    ? [{ context: spanContext }]
    : [];
}

/** ใส่ attribute ให้ span ที่ active อยู่ (ไม่มี span = ไม่ทำอะไร) */
export function setActiveSpanAttributes(attributes: Attributes): void {
  trace.getActiveSpan()?.setAttributes(attributes);
}

/** link span ที่ active อยู่ไปยัง trace ใน carrier (เช่น finalize → trace ตอน submit) */
export function addActiveSpanLinks(carrier: unknown): void {
  const links = linksFromCarrier(carrier);
  if (links.length) trace.getActiveSpan()?.addLinks(links);
}

/** attribute มาตรฐานของ BullMQ job — `task.id` มาจาก `job.data.taskId` ถ้ามี */
export function bullJobAttributes(job: {
  name: string;
  id?: string;
  attemptsMade: number;
  data: unknown;
}): Attributes {
  const taskId =
    job.data && typeof job.data === 'object'
      ? (job.data as Record<string, unknown>).taskId
      : undefined;
  return {
    'messaging.system': 'bullmq',
    'job.name': job.name,
    'job.id': job.id ?? '',
    'job.attempt': job.attemptsMade + 1,
    ...(typeof taskId === 'string' ? { 'task.id': taskId } : {}),
  };
}

/**
 * รัน fn ใน span ใหม่ที่เป็นลูกของ trace ใน carrier (ไม่มี carrier = span ราก)
 * error ถูก record ลง span แล้ว throw ต่อตามเดิม
 */
export function withExtractedContext<T>(
  carrier: unknown,
  name: string,
  fn: () => Promise<T>,
  options: { attributes?: Attributes; links?: Link[]; kind?: SpanKind } = {},
): Promise<T> {
  const parent = propagation.extract(context.active(), toCarrier(carrier));
  const tracer = trace.getTracer(TRACER_NAME);
  return tracer.startActiveSpan(
    name,
    {
      kind: options.kind ?? SpanKind.CONSUMER,
      attributes: options.attributes,
      links: options.links,
    },
    parent,
    async (span) => {
      try {
        return await fn();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        span.recordException(err);
        span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

type TracedJob = Parameters<typeof bullJobAttributes>[0];

/**
 * decorator สำหรับ `WorkerHost.process` — เปิด span `Class.method` ต่อจาก trace ใน `job.data._otel`
 * พร้อม attribute ของ job (`task.id`, `job.name`, ...)
 */
export function TraceJob(): MethodDecorator {
  return (target, propertyKey, descriptor: PropertyDescriptor) => {
    const original = descriptor.value as (
      ...args: unknown[]
    ) => Promise<unknown>;
    const name = `${target.constructor.name}.${String(propertyKey)}`;
    descriptor.value = function (
      this: unknown,
      job: TracedJob,
      ...rest: unknown[]
    ) {
      return withExtractedContext(
        readTraceCarrier(job?.data),
        name,
        () => original.apply(this, [job, ...rest]),
        { attributes: bullJobAttributes(job) },
      );
    };
  };
}
