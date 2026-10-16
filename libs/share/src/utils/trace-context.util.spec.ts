import { context, propagation, trace } from '@opentelemetry/api';
import { node, tracing } from '@opentelemetry/sdk-node';
import {
  TraceJob,
  addActiveSpanLinks,
  bullJobAttributes,
  injectTraceContext,
  linksFromCarrier,
  readTraceCarrier,
  setActiveSpanAttributes,
  TRACE_CARRIER_KEY,
  withExtractedContext,
} from './trace-context.util';

describe('trace-context.util', () => {
  const exporter = new tracing.InMemorySpanExporter();
  const provider = new node.NodeTracerProvider({
    spanProcessors: [new tracing.SimpleSpanProcessor(exporter)],
  });

  beforeAll(() => provider.register());
  afterEach(() => exporter.reset());
  afterAll(async () => {
    await provider.shutdown();
    trace.disable();
    context.disable();
    propagation.disable();
  });

  const tracer = () => trace.getTracer('test');

  it('inject → withExtractedContext ต่อ trace เดิม (child span)', async () => {
    let carrier = {};
    let parentTraceId = '';
    let parentSpanId = '';
    tracer().startActiveSpan('producer', (span) => {
      carrier = injectTraceContext();
      parentTraceId = span.spanContext().traceId;
      parentSpanId = span.spanContext().spanId;
      span.end();
    });

    expect(carrier).toHaveProperty('traceparent');

    await withExtractedContext(carrier, 'Consumer.process', async () => {
      setActiveSpanAttributes({ 'task.id': 't-1' });
    });

    const consumer = exporter
      .getFinishedSpans()
      .find((s) => s.name === 'Consumer.process');
    expect(consumer?.spanContext().traceId).toBe(parentTraceId);
    expect(consumer?.parentSpanContext?.spanId).toBe(parentSpanId);
    expect(consumer?.attributes['task.id']).toBe('t-1');
  });

  it('ไม่มี carrier → เป็น span ราก', async () => {
    await withExtractedContext(undefined, 'Root.run', async () => undefined);
    const root = exporter.getFinishedSpans().find((s) => s.name === 'Root.run');
    expect(root).toBeDefined();
    expect(root?.parentSpanContext).toBeUndefined();
  });

  it('fn throw → record exception, status ERROR, throw ต่อ', async () => {
    await expect(
      withExtractedContext({}, 'Fail.run', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const span = exporter.getFinishedSpans().find((s) => s.name === 'Fail.run');
    expect(span?.status.code).toBe(2);
    expect(span?.events.some((e) => e.name === 'exception')).toBe(true);
  });

  it('readTraceCarrier อ่านเฉพาะค่า string จาก _otel', () => {
    expect(
      readTraceCarrier({ [TRACE_CARRIER_KEY]: { traceparent: 'x', n: 1 } }),
    ).toEqual({
      traceparent: 'x',
    });
    expect(readTraceCarrier(null)).toEqual({});
    expect(readTraceCarrier({ other: 1 })).toEqual({});
  });

  it('linksFromCarrier คืน link เมื่อ carrier ถูกต้อง, [] เมื่อไม่ถูก', () => {
    let carrier = {};
    tracer().startActiveSpan('submit', (span) => {
      carrier = injectTraceContext();
      span.end();
    });
    expect(linksFromCarrier(carrier)).toHaveLength(1);
    expect(linksFromCarrier({ traceparent: 'garbage' })).toEqual([]);
    expect(linksFromCarrier(undefined)).toEqual([]);
  });

  it('addActiveSpanLinks ใส่ link ให้ span ที่ active', async () => {
    let carrier = {};
    let submitTraceId = '';
    tracer().startActiveSpan('submit', (span) => {
      carrier = injectTraceContext();
      submitTraceId = span.spanContext().traceId;
      span.end();
    });
    await withExtractedContext(undefined, 'Finalize.run', async () => {
      addActiveSpanLinks(carrier);
      addActiveSpanLinks(undefined);
    });
    const span = exporter
      .getFinishedSpans()
      .find((s) => s.name === 'Finalize.run');
    expect(span?.links).toHaveLength(1);
    expect(span?.links[0].context.traceId).toBe(submitTraceId);
  });

  it('bullJobAttributes ใส่ task.id เมื่อ data มี taskId', () => {
    expect(
      bullJobAttributes({
        name: 'video',
        id: 'j1',
        attemptsMade: 0,
        data: { taskId: 't-9' },
      }),
    ).toEqual({
      'messaging.system': 'bullmq',
      'job.name': 'video',
      'job.id': 'j1',
      'job.attempt': 1,
      'task.id': 't-9',
    });
    expect(
      bullJobAttributes({ name: 'sweep', attemptsMade: 2, data: null }),
    ).not.toHaveProperty('task.id');
  });

  it('@TraceJob ต่อ trace จาก job.data._otel และใส่ attribute ของ job', async () => {
    class FakeProcessor {
      @TraceJob()
      async process(job: { data: unknown }): Promise<string> {
        return `ok:${(job.data as { taskId: string }).taskId}`;
      }
    }
    let carrier = {};
    let parentTraceId = '';
    tracer().startActiveSpan('enqueue', (span) => {
      carrier = injectTraceContext();
      parentTraceId = span.spanContext().traceId;
      span.end();
    });

    const result = await new FakeProcessor().process({
      name: 'video',
      id: 'j1',
      attemptsMade: 0,
      data: { taskId: 't-1', [TRACE_CARRIER_KEY]: carrier },
    } as never);

    expect(result).toBe('ok:t-1');
    const span = exporter
      .getFinishedSpans()
      .find((s) => s.name === 'FakeProcessor.process');
    expect(span?.spanContext().traceId).toBe(parentTraceId);
    expect(span?.attributes['task.id']).toBe('t-1');
    expect(span?.attributes['job.name']).toBe('video');
  });

  it('ไม่มี span active → injectTraceContext คืน {}', () => {
    expect(injectTraceContext()).toEqual({});
  });
});
