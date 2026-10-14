/**
 * ตรวจ password กับ Keycloak password policy (เช่น `length(8) and upperCase(1)`)
 *
 * @returns ข้อความ error ของกฎแรกที่ไม่ผ่าน หรือ `null` เมื่อผ่านทุกกฎ / ไม่มี policy
 */
export function checkPasswordPolicy(
  password: string,
  policy: string,
): string | null {
  if (!policy) return null;

  const rules = policy.split(' and ');

  for (const rule of rules) {
    const count = parseInt(rule.match(/\d+/)?.[0] ?? '0');
    if (rule.startsWith('length')) {
      if (password.length < count) {
        return `Password must be at least ${count} characters long`;
      }
    } else if (rule.startsWith('upperCase')) {
      if ((password.match(/[A-Z]/g) || []).length < count) {
        return `Password must contain at least ${count} uppercase characters`;
      }
    } else if (rule.startsWith('lowerCase')) {
      if ((password.match(/[a-z]/g) || []).length < count) {
        return `Password must contain at least ${count} lowercase characters`;
      }
    } else if (rule.startsWith('digits')) {
      if ((password.match(/\d/g) || []).length < count) {
        return `Password must contain at least ${count} digits`;
      }
    } else if (rule.startsWith('specialChars')) {
      if ((password.match(/[^A-Za-z0-9]/g) || []).length < count) {
        return `Password must contain at least ${count} special characters`;
      }
    }
    // notUsername และกฎอื่นไม่ได้ตรวจที่นี่ — Keycloak จะปฏิเสธเองตอน createUser
  }
  return null;
}
