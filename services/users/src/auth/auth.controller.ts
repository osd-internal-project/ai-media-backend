import { Body, Controller, Post } from '@nestjs/common';
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
}
