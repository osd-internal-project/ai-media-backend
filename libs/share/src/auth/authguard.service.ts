import { Injectable, ForbiddenException } from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
const jwtConfig = {
  secret: 'osdsupersecertkey',
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
