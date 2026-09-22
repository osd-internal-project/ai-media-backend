import {
  Body,
  Controller,
  Post,
  Headers,
  UnauthorizedException,
  BadRequestException,
  Get,
  Param,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { IDP_HINTS, isIdpHint } from '../keycloak/keycloak.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  /**
   * Authorization URL for a brokered identity provider.
   *
   * Declared before the `google` routes below purely for readability — they are distinct
   * literal paths, so ordering does not matter here.
   */
  @Get('idp/:idp')
  async idpLogin(@Param('idp') idp: string) {
    if (!isIdpHint(idp)) {
      throw new BadRequestException(
        `Unsupported identity provider '${idp}'. Supported: ${IDP_HINTS.join(', ')}`,
      );
    }
    return { url: await this.authService.getIdpLoginUrl(idp) };
  }

  /**
   * Completes a brokered login. Provider-agnostic — Keycloak returns to one registered
   * redirect URI carrying only the authorization code.
   */
  @Post('idp/callback')
  async idpCallback(@Body() body: { code: string }) {
    if (!body?.code) {
      throw new BadRequestException('Missing authorization code');
    }
    return this.authService.idpCallback(body.code);
  }

  /** @deprecated Use `GET /auth/idp/google`. Kept for already-deployed frontends. */
  @Get("google")
  async googleLogin() {
    return {
      url: await this.authService.getGoogleLoginUrl()
    };
  }

  /** @deprecated Use `POST /auth/idp/callback`. Kept for already-deployed frontends. */
  @Post("google/callback")
  async googleCallback(@Body() body: any) {
    return this.authService.googleCallback(body.code);
  }

  @Post('login')
  async login(@Body() loginDto: any) {
    return this.authService.login(loginDto);
  }

  /**
   * SSO gate: confirms a local account and returns the fields the session needs.
   * `exists` is kept for frontends deployed before this change.
   */
  @Post('check')
  async check(@Body() body: { email: string }) {
    const user = await this.authService.checkUser(body.email);
    return { exists: !!user, ...user };
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
