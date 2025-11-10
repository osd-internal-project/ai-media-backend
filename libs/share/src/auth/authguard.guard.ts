import {
  Injectable,
  CanActivate,
  ExecutionContext,
  // UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
const jwtConfig = {
  secret: 'osdsupersecertkey',
  expires: 60 * 60,
  refreshExpires: 70 * 70 * 24 * 7,
};
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<any> {
    // return false;
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFormatHeader(request);
    if (!token) {
      // throw new UnauthorizedException('Missing token');
      return false;
    }
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: jwtConfig.secret,
      });
      request['user'] = payload;
      return true;
    } catch (error) {
      // throw new UnauthorizedException(`Token invalid! :(${error.message})`);
      return false;
    }
  }

  private extractTokenFormatHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
