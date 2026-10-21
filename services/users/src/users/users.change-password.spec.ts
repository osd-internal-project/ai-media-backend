import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import {
  AuthUser,
  CreditBalanceRepository,
  GroupsRepository,
  LlmGatewayService,
  OrganizationMemberRepository,
  OrganizationRepository,
  OrganizationSubscriptionRepository,
  PlanPriceRepository,
  PlanRepository,
  ProjectMemberRepository,
  ProjectRepository,
  RegisterRepository,
  RequestChangePasswordRepository,
  UsersRepository,
} from '@ai-media/share';
import { KeycloakService } from 'src/keycloak/keycloak.service';
import { UsersService } from './users.service';

const me: AuthUser = { userId: 'u-1', token: 'kc-1', role: 'USER' };
const dto = { currentPassword: 'Old12345', newPassword: 'New12345' };

describe('UsersService.changeMyPassword', () => {
  let service: UsersService;
  const userRepo = { findOne: jest.fn() };
  const keycloak = {
    login: jest.fn(),
    getPasswordPolicy: jest.fn(),
    updateUser: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    userRepo.findOne.mockResolvedValue({
      userId: 'u-1',
      username: 'alice',
      token: 'kc-1',
    });
    keycloak.getPasswordPolicy.mockResolvedValue('length(8) and digits(1)');
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UsersRepository, useValue: userRepo },
        { provide: KeycloakService, useValue: keycloak },
        ...[
          CreditBalanceRepository,
          OrganizationRepository,
          ProjectRepository,
          OrganizationMemberRepository,
          ProjectMemberRepository,
          LlmGatewayService,
          GroupsRepository,
          PlanRepository,
          PlanPriceRepository,
          HttpService,
          RegisterRepository,
          RequestChangePasswordRepository,
          OrganizationSubscriptionRepository,
        ].map((provide) => ({ provide, useValue: {} })),
      ],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  it('updates the Keycloak password after the current one checks out', async () => {
    keycloak.login.mockResolvedValue({ access_token: 't' });
    await expect(service.changeMyPassword(me, dto)).resolves.toEqual({
      message: 'Password updated successfully',
    });
    expect(keycloak.login).toHaveBeenCalledWith({
      username: 'alice',
      password: 'Old12345',
    });
    expect(keycloak.updateUser).toHaveBeenCalledWith('kc-1', {
      password: 'New12345',
    });
  });

  it('rejects a wrong current password without changing anything', async () => {
    keycloak.login.mockRejectedValue(new BadRequestException('Invalid'));
    await expect(service.changeMyPassword(me, dto)).rejects.toThrow(
      'Current password is incorrect',
    );
    expect(keycloak.updateUser).not.toHaveBeenCalled();
  });

  it('rejects a new password that breaks the policy', async () => {
    keycloak.login.mockResolvedValue({ access_token: 't' });
    await expect(
      service.changeMyPassword(me, { ...dto, newPassword: 'short' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(keycloak.updateUser).not.toHaveBeenCalled();
  });

  it('forbids a request without an authenticated user', async () => {
    await expect(service.changeMyPassword(undefined, dto)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
