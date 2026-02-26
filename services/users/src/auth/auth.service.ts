import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { KeycloakService } from '../keycloak/keycloak.service';
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

  async getGoogleLoginUrl() {
    return await this.keycloakService.getGoogleLoginUrl();
  }

  async googleCallback(code: string) {
    return await this.keycloakService.googleCallback(code);
  }

  async checkUserExists(email: string) {
    const user = await this.usersRepo.findOne({
      where: { email },
    });
    return !!user;
  }

  async validateToken(token: string) {
    return this.keycloakService.validateToken(token);
  }
}
