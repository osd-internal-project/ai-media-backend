import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { IdpHint, KeycloakService } from '../keycloak/keycloak.service';
import { BLOCKED_STATUSES, KeycloakJwtVerifier, UsersRepository } from '@ai-media/share';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

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
   * With a token the user is matched by `sub` (what the API guard uses); `email` alone is
   * the form sent by frontends deployed before the token form.
   * @returns the user, with `blocked: true` when its status cannot sign in; null when none.
   */
  async checkUser(input: { accessToken?: string; email?: string }) {
    const find = (where: { token: string } | { email: string }) =>
      this.usersRepo.findOne({
        where,
        select: {
          userId: true,
          username: true,
          email: true,
          role: true,
          status: true,
          recentOrganizationId: true,
        },
      });

    let user: Awaited<ReturnType<typeof find>> = null;
    if (input.accessToken) {
      const claims = await this.jwtVerifier.verify(input.accessToken).catch((error: Error) => {
        throw new UnauthorizedException(error.message);
      });
      user = await find({ token: claims.sub });
      if (!user && claims.email) {
        user = await find({ email: claims.email });
        // The API guard rejects this user in AUTH_MODE=enforce; nothing is changed here.
        if (user) this.logger.warn(`[auth:check] sub mismatch for userId ${user.userId}`);
      }
    } else if (input.email) {
      user = await find({ email: input.email });
    }
    if (user && BLOCKED_STATUSES.includes(user.status)) {
      return { ...user, blocked: true };
    }
    return user;
  }

  async validateToken(token: string) {
    return this.keycloakService.validateToken(token);
  }
}
