import { Body, Controller, Post, Headers, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() loginDto: any) {
    return this.authService.login(loginDto);
  }

  @Post('check')
  async check(@Body() body: { email: string }) {
    const exists = await this.authService.checkUserExists(body.email);
    return { exists };
  }

  @Post('validate')
  // async validate(@Body() body: { token: string }) {
    // const isValid = await this.authService.validateToken(body.token);
  async validate(@Headers('authorization') authHeader: string) {
    if (!authHeader) {
      throw new UnauthorizedException('Authorization header missing');
    }
    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid token format');
    }
    const isValid = await this.authService.validateToken(token);
    return { valid: isValid };
  }
}
