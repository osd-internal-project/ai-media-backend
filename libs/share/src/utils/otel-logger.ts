import { ConsoleLogger } from '@nestjs/common';
import { trace, TraceFlags } from '@opentelemetry/api';

/** trace id ของ span ที่ active — เฉพาะ trace ที่ถูก sample (ส่งไป Tempo จริง) */
export function currentTraceId(): string | undefined {
  const spanContext = trace.getActiveSpan()?.spanContext();
  if (!spanContext || !trace.isSpanContextValid(spanContext)) return undefined;
  return spanContext.traceFlags & TraceFlags.SAMPLED
    ? spanContext.traceId
    : undefined;
}

/**
 * ConsoleLogger ที่เติม `trace_id=<id>` ต่อท้าย `[Context]` เมื่อมี trace ที่ active
 * ให้ Grafana ทำ derived field จาก log ไป Tempo ได้ — รูปแบบอื่นคงเดิม
 */
export class OtelLogger extends ConsoleLogger {
  protected formatContext(context: string): string {
    const traceId = currentTraceId();
    const base = super.formatContext(context);
    return traceId ? `${base}trace_id=${traceId} ` : base;
  }
}
