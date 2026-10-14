/** รวม status/code/requestId ของ TosServerError ไว้ใน log บรรทัดเดียว (error อื่นคืน message) */
export function describeTosError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const tos = error as Error & {
    statusCode?: number;
    code?: string;
    requestId?: string;
  };
  if (tos.statusCode === undefined) return error.message;
  return `status=${tos.statusCode} code=${tos.code} requestId=${tos.requestId} message=${error.message}`;
}
