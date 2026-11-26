/** list ว่าง (หรือ null ของแถวเก่า) = ใช้ได้ทุก model ที่ active — org เดิมจึงไม่ถูกจำกัด */
export function isModelAllowed(
  allowedModelIds: number[] | null | undefined,
  modelId: number,
): boolean {
  return !allowedModelIds?.length || allowedModelIds.includes(modelId);
}
