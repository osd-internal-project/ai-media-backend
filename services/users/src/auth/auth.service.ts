import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { IdpHint, KeycloakService } from '../keycloak/keycloak.service';
import { KeycloakJwtVerifier, UsersRepository } from '@ai-media/share';

@Injectable()
export class AuthService {
  constructor(
    private readonly keycloakService: KeycloakService,
    private readonly usersRepo: UsersRepository,
    private readonly jwtVerifier: KeycloakJwtVerifier,
  ) { }

  /**
   * First SSO sign-in: creates the local user behind a Keycloak access token.
   * Identity comes only from the verified token, never from the request body.
   */
  async provisionSsoUser(accessToken: string) {
    const claims = await this.jwtVerifier.verify(accessToken).catch((error: Error) => {
      throw new UnauthorizedException(error.message);
    });
    const user = await this.keycloakService.ensureLocalUser(claims.email, claims.sub);
    if (!user) {
      throw new UnauthorizedException('No Keycloak user for this token');
    }
    return user;
  }

  async login(loginDto: any) {
    // 1. Check if user exists in local database
    const user = await this.usersRepo.findOne({
      where: {
        OR: [
          { username: loginDto.username },
          { email: loginDto.username }, // Keycloak often accepts email as username
        ],
      },
    });

    if (!user) {
      throw new ForbiddenException('Not User'); // Message as requested
    }

    // 2. If exists, proceed to Keycloak authentication
    return this.keycloakService.login(loginDto);
  }

  /**
   * @param idp Identity provider to route the user to.
   * @returns The Keycloak authorization URL for that provider.
   */
  async getIdpLoginUrl(idp: IdpHint) {
    return await this.keycloakService.getIdpLoginUrl(idp);
  }

  /**
   * Exchanges an IdP authorization code and provisions the local user.
   *
   * @param code Authorization code from the Keycloak redirect.
   */
  async idpCallback(code: string) {
    return await this.keycloakService.idpCallback(code);
  }

  /** @deprecated Use {@link getIdpLoginUrl}. */
  async getGoogleLoginUrl() {
    return await this.keycloakService.getIdpLoginUrl('google');
  }

  /** @deprecated Use {@link idpCallback}. */
  async googleCallback(code: string) {
    return await this.keycloakService.idpCallback(code);
  }

  /**
   * Local user backing a Keycloak SSO sign-in — the session's only source of
   * role and organization.
   *
   * @param email Email claim from the Keycloak id_token.
   */
  async checkUser(email: string) {
    return this.usersRepo.findOne({
      where: { email },
      select: {
        userId: true,
        username: true,
        email: true,
        role: true,
        status: true,
        recentOrganizationId: true,
      },
    });
  }

  async validateToken(token: string) {
    return this.keycloakService.validateToken(token);
  }
}
