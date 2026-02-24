import { Body, Controller, Post, Headers, UnauthorizedException, Get } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Get("google")
  async googleLogin() {
    return {
      url: await this.authService.getGoogleLoginUrl()
    };
  }

  @Post("google/callback")
  async googleCallback(@Body() body: any) {
    return this.authService.googleCallback(body.code);
  }

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
