import { Injectable, ForbiddenException } from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
// secret เดิมถูก hardcode ไว้ใน repo (ถือว่ารั่วแล้ว) — ไม่ได้ใช้ตรวจ request; ตัวตรวจจริงคือ KeycloakAuthGuard
const jwtConfig = {
  get secret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is not set');
    return secret;
  },
  expires: 60 * 60,
  refreshExpires: 70 * 70 * 24 * 7,
};
@Injectable()
export class AuthguardService {
  constructor(private jwtService: JwtService) {}
  createToken(payload) {
    try {
      const accessToken = this.jwtService.sign(payload, {
        secret: jwtConfig.secret,
        expiresIn: jwtConfig.expires,
      });

      const refreshToken = this.jwtService.sign(payload, {
        secret: jwtConfig.secret,
        expiresIn: jwtConfig.refreshExpires,
      });
      return { accessToken, refreshToken };
    } catch (e) {
      throw new ForbiddenException(e.message);
    }
  }
  getTokenpayload(refreshToken) {
    return this.jwtService.verifyAsync(refreshToken, {
      secret: jwtConfig.secret,
    });
  }
}
