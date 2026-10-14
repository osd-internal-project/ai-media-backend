import { Injectable } from '@nestjs/common';
import { createPublicKey, JsonWebKey, KeyObject, verify } from 'crypto';
import * as https from 'https';

/** claim ที่ระบบใช้จาก Keycloak access token */
export interface KeycloakClaims {
  sub: string;
  iss: string;
  azp?: string;
  exp: number;
  nbf?: number;
  email?: string;
}

/** เหตุผลที่ token ไม่ผ่าน — ใช้ใน log ของโหมด report (ไม่มีค่า token ปนอยู่) */
export class AuthTokenError extends Error {}

interface Jwk extends JsonWebKey {
  kid?: string;
  use?: string;
  alg?: string;
}

const JWKS_TTL_MS = 60 * 60 * 1000;
/** kid ไม่รู้จัก → ดึง JWKS ใหม่ได้ไม่เกินนาทีละครั้ง กันคนส่ง kid มั่ว ๆ ให้เรายิง Keycloak รัว ๆ */
const JWKS_REFETCH_MIN_MS = 60 * 1000;
const CLOCK_SKEW_SEC = 60;
const JWKS_TIMEOUT_MS = 5000;

/**
 * ตรวจ Keycloak access token (RS256) ด้วย JWKS ของ realm โดยใช้ `crypto` ของ Node — ไม่พึ่ง package เพิ่ม
 * config: `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_ALLOWED_CLIENTS` (คั่นด้วย comma)
 */
@Injectable()
export class KeycloakJwtVerifier {
  private keys = new Map<string, KeyObject>();
  private fetchedAt = 0;
  private inflight: Promise<void> | null = null;

  /**
   * @returns claims เมื่อ token ถูกต้อง
   * @throws AuthTokenError เมื่อ token ผิดรูป, ลายเซ็นไม่ถูก, หมดอายุ, iss/azp ไม่ตรง
   */
  async verify(token: string): Promise<KeycloakClaims> {
    const parts = token.split('.');
    if (parts.length !== 3) throw new AuthTokenError('malformed token');
    const [rawHeader, rawPayload, rawSignature] = parts;
    const header = this.decodeJson<{ alg?: string; kid?: string }>(rawHeader);
    // ห้ามเชื่อ alg จาก token เกินกว่านี้ — กัน `none` / HS256 ที่ใช้ public key เป็น secret
    if (header.alg !== 'RS256') {
      throw new AuthTokenError(`unsupported alg ${header.alg}`);
    }
    const key = await this.keyFor(header.kid);
    const valid = verify(
      'RSA-SHA256',
      Buffer.from(`${rawHeader}.${rawPayload}`),
      key,
      Buffer.from(rawSignature, 'base64url'),
    );
    if (!valid) throw new AuthTokenError('bad signature');

    const claims = this.decodeJson<KeycloakClaims>(rawPayload);
    this.checkClaims(claims);
    return claims;
  }

  private checkClaims(claims: KeycloakClaims): void {
    const now = Math.floor(Date.now() / 1000);
    if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_SEC < now) {
      throw new AuthTokenError('token expired');
    }
    if (typeof claims.nbf === 'number' && claims.nbf - CLOCK_SKEW_SEC > now) {
      throw new AuthTokenError('token not yet valid');
    }
    if (claims.iss !== this.issuer()) {
      throw new AuthTokenError(`unexpected issuer ${claims.iss}`);
    }
    const clients = allowedClients();
    if (clients.length === 0) {
      throw new AuthTokenError('KEYCLOAK_ALLOWED_CLIENTS is not set');
    }
    if (!claims.azp || !clients.includes(claims.azp)) {
      throw new AuthTokenError(`unexpected client ${claims.azp}`);
    }
    if (!claims.sub) throw new AuthTokenError('missing sub');
  }

  private async keyFor(kid: string | undefined): Promise<KeyObject> {
    if (!kid) throw new AuthTokenError('missing kid');
    const stale = Date.now() - this.fetchedAt > JWKS_TTL_MS;
    const unknown = !this.keys.has(kid);
    const mayRefetch = Date.now() - this.fetchedAt > JWKS_REFETCH_MIN_MS;
    if (stale || (unknown && mayRefetch)) await this.refreshKeys();
    const key = this.keys.get(kid);
    if (!key) throw new AuthTokenError(`unknown kid ${kid}`);
    return key;
  }

  private async refreshKeys(): Promise<void> {
    // request พร้อมกันหลายตัวใช้ fetch ครั้งเดียว
    this.inflight ??= this.loadKeys().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async loadKeys(): Promise<void> {
    const jwks = await this.fetchJwks();
    const keys = new Map<string, KeyObject>();
    for (const jwk of jwks.keys ?? []) {
      if (jwk.kty !== 'RSA' || !jwk.kid || (jwk.use && jwk.use !== 'sig')) {
        continue;
      }
      keys.set(jwk.kid, createPublicKey({ key: jwk, format: 'jwk' }));
    }
    this.keys = keys;
    this.fetchedAt = Date.now();
  }

  /** แยกไว้ให้ test แทนที่ได้ */
  protected fetchJwks(): Promise<{ keys?: Jwk[] }> {
    const url = `${this.issuer()}/protocol/openid-connect/certs`;
    return new Promise((resolve, reject) => {
      const req = https.get(url, { timeout: JWKS_TIMEOUT_MS }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new AuthTokenError(`JWKS ${url} returned ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString()));
          } catch {
            reject(new AuthTokenError(`JWKS ${url} is not JSON`));
          }
        });
      });
      req.on('timeout', () => req.destroy(new Error('JWKS request timed out')));
      req.on('error', (error) =>
        reject(new AuthTokenError(`JWKS fetch failed: ${error.message}`)),
      );
    });
  }

  private issuer(): string {
    const base = (process.env.KEYCLOAK_URL ?? '').replace(/\/$/, '');
    return `${base}/realms/${process.env.KEYCLOAK_REALM ?? ''}`;
  }

  private decodeJson<T>(segment: string): T {
    try {
      return JSON.parse(Buffer.from(segment, 'base64url').toString()) as T;
    } catch {
      throw new AuthTokenError('malformed token');
    }
  }
}

function allowedClients(): string[] {
  return (process.env.KEYCLOAK_ALLOWED_CLIENTS ?? '')
    .split(',')
    .map((client) => client.trim())
    .filter(Boolean);
}
