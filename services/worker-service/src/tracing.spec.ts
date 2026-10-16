import { trace } from '@opentelemetry/api';
import { buildMetricReaders, isIgnoredPath, startTracing } from './tracing';

describe('buildMetricReaders', () => {
  it.each([undefined, 'none', 'prometheus', 'console'])(
    'has no reader for OTEL_METRICS_EXPORTER=%s',
    (value) => {
      expect(buildMetricReaders({ OTEL_METRICS_EXPORTER: value })).toHaveLength(
        0,
      );
    },
  );

  it('has an OTLP reader for OTEL_METRICS_EXPORTER=otlp', () => {
    expect(buildMetricReaders({ OTEL_METRICS_EXPORTER: 'otlp' })).toHaveLength(
      1,
    );
  });
});

describe('startTracing', () => {
  it('is a no-op without OTEL_EXPORTER_OTLP_ENDPOINT', () => {
    expect(startTracing({})).toBeUndefined();
  });

  it('is a no-op when OTEL_SDK_DISABLED=true', () => {
    expect(
      startTracing({
        OTEL_SDK_DISABLED: 'true',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318',
      }),
    ).toBeUndefined();
  });

  it('registers a real tracer provider when an endpoint is set', async () => {
    const sdk = startTracing({
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318',
    });
    try {
      expect(sdk).toBeDefined();
      const span = trace.getTracer('test').startSpan('probe');
      // no-op tracer ให้ trace id เป็นศูนย์ทั้งหมด
      expect(span.spanContext().traceId).not.toBe('0'.repeat(32));
      // ไม่ end() — exporter ใช้ dynamic import() ซึ่ง jest vm ไม่รองรับ; export path ทดสอบด้วย node จริง
    } finally {
      await sdk?.shutdown();
    }
  });
});

describe('isIgnoredPath', () => {
  it.each([
    '/api',
    '/api/',
    '/api-json',
    '/api/swagger-ui.css',
    '/socket.io/?EIO=4',
    '/websockets',
  ])('ignores %s', (url) => expect(isIgnoredPath(url)).toBe(true));

  it.each(['/api/project', '/api/generate/image?x=1', undefined])(
    'traces %s',
    (url) => expect(isIgnoredPath(url)).toBe(false),
  );
});
