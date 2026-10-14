import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';

const METRIC_EXPORT_INTERVAL_MS = 60_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;

// swagger + websocket ไม่ต้องเก็บ trace — มีแต่ noise และ socket.io long-polling ยิงถี่
const IGNORED_PATH = /^\/(api(-json|\/swagger-ui[^/]*)?\/?$|socket\.io|websockets)/;

export function isIgnoredPath(url: string | undefined): boolean {
  return IGNORED_PATH.test((url ?? '').split('?')[0]);
}

// ส่ง metrics เฉพาะเมื่อขอ otlp ชัดเจน — SIT ส่งตรงเข้า Tempo ซึ่งไม่รับ metrics; prometheus ห้ามเปิด port
export function buildMetricReaders(env: NodeJS.ProcessEnv): PeriodicExportingMetricReader[] {
  if (env.OTEL_METRICS_EXPORTER?.trim() !== 'otlp') {
    return [];
  }
  return [
    new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: METRIC_EXPORT_INTERVAL_MS,
    }),
  ];
}

/**
 * เริ่ม OpenTelemetry SDK ตาม env มาตรฐาน `OTEL_*` (trace exporter/protocol ให้ NodeSDK สร้างจาก env)
 * คืน undefined (no-op) เมื่อ `OTEL_SDK_DISABLED=true` หรือไม่ได้ตั้ง `OTEL_EXPORTER_OTLP_ENDPOINT`
 */
export function startTracing(env: NodeJS.ProcessEnv = process.env): NodeSDK | undefined {
  if (env.OTEL_SDK_DISABLED === 'true' || !env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    return undefined;
  }

  const sdk = new NodeSDK({
    metricReaders: buildMetricReaders(env),
    // ระบุเป็น [] เพื่อไม่ให้ SDK สร้าง log exporter ตาม env
    logRecordProcessors: [],
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (req) => isIgnoredPath(req.url),
      }),
      new ExpressInstrumentation(),
      new NestInstrumentation(),
      new IORedisInstrumentation(),
    ],
  });

  try {
    sdk.start();
  } catch (error) {
    // collector/telemetry พังต้องไม่ทำให้ service ล่ม
    console.error('[otel] failed to start OpenTelemetry SDK', error);
    return undefined;
  }

  // มี handler แล้ว Node จะไม่ exit เองตอน SIGTERM — flush span ที่ค้างแล้ว exit
  process.once('SIGTERM', () => {
    // timer ค้ำ event loop ระหว่าง exporter รอ dynamic import() และจำกัดเวลา shutdown
    const deadline = setTimeout(() => process.exit(0), SHUTDOWN_TIMEOUT_MS);
    sdk
      .shutdown()
      .catch((error) => console.error('[otel] shutdown failed', error))
      .finally(() => {
        clearTimeout(deadline);
        process.exit(0);
      });
  });

  return sdk;
}

export const otelSdk = startTracing();
