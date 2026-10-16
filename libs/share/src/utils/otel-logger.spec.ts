import { context, propagation, trace, TraceFlags } from '@opentelemetry/api';
import { node, tracing } from '@opentelemetry/sdk-node';
import { currentTraceId, OtelLogger } from './otel-logger';

describe('OtelLogger', () => {
  const provider = new node.NodeTracerProvider({
    spanProcessors: [
      new tracing.SimpleSpanProcessor(new tracing.InMemorySpanExporter()),
    ],
  });
  let output = '';
  let writeSpy: jest.SpyInstance;

  beforeAll(() => provider.register());
  beforeEach(() => {
    output = '';
    writeSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        // ตัด ANSI color ของ Nest ออกก่อนเทียบข้อความ
        output += String(chunk).replace(/\x1b\[[0-9;]*m/g, '');
        return true;
      });
  });
  afterEach(() => writeSpy.mockRestore());
  afterAll(async () => {
    await provider.shutdown();
    trace.disable();
    context.disable();
    propagation.disable();
  });

  it('เติม trace_id หลัง [Context] เมื่อมี span ที่ sample', () => {
    const logger = new OtelLogger();
    let traceId = '';
    trace.getTracer('test').startActiveSpan('work', (span) => {
      traceId = span.spanContext().traceId;
      logger.log('hello', 'VideoProcessor');
      span.end();
    });
    expect(output).toContain(`[VideoProcessor] trace_id=${traceId} `);
    expect(output).toContain('hello');
  });

  it('ไม่มี span → log รูปแบบเดิม ไม่มี trace_id', () => {
    new OtelLogger().log('hello', 'VideoProcessor');
    expect(output).toContain('[VideoProcessor] ');
    expect(output).not.toContain('trace_id=');
  });

  it('span ที่ไม่ถูก sample → ไม่คืน trace id', () => {
    const unsampled = trace.wrapSpanContext({
      traceId: '0af7651916cd43dd8448eb211c80319c',
      spanId: 'b7ad6b7169203331',
      traceFlags: TraceFlags.NONE,
    });
    context.with(trace.setSpan(context.active(), unsampled), () => {
      expect(currentTraceId()).toBeUndefined();
    });
  });
});
