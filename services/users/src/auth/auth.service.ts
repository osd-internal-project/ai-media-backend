import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { IdpHint, KeycloakService } from '../keycloak/keycloak.service';
import { UsersRepository } from '@ai-media/share';

@Injectable()
export class AuthService {
  constructor(
    private readonly keycloakService: KeycloakService,
    private readonly usersRepo: UsersRepository,
  ) { }

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
   * Local user record backing a Keycloak SSO sign-in.
   *
   * The SSO flow has no other source for these fields — without them the NextAuth
   * session carries no role or organization and every role gate fails closed.
   *
   * @param email Email claim from the Keycloak id_token.
   * @returns The user, or null when the email has no local account.
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
