import { ConflictException } from '@nestjs/common';
import { OrganizationSeatService } from './organization-seat.service';

describe('OrganizationSeatService', () => {
  const organizationRepo = { findOne: jest.fn() };
  const memberRepo = { count: jest.fn() };
  const invitationRepo = { count: jest.fn() };
  const service = new OrganizationSeatService(
    organizationRepo as never,
    memberRepo as never,
    invitationRepo as never,
  );

  const given = (max: number | null, active: number, pending: number) => {
    organizationRepo.findOne.mockResolvedValue({ maxUserAccess: max });
    memberRepo.count.mockResolvedValue(active);
    invitationRepo.count.mockResolvedValue(pending);
  };

  it('counts active members and unexpired pending invites only', async () => {
    given(10, 8, 2);
    await expect(service.usage('org-1')).resolves.toEqual({ active: 8, pending: 2, max: 10 });
    expect(memberRepo.count).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', status: 'active' },
    });
    const { where } = invitationRepo.count.mock.calls[0][0];
    expect(where).toMatchObject({ organizationId: 'org-1', status: 'PENDING' });
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
  });

  it('allows adding up to the limit and rejects one past it', async () => {
    given(10, 8, 1);
    await expect(service.assertAvailable('org-1', 1)).resolves.toBeUndefined();
    given(10, 8, 2);
    await expect(service.assertAvailable('org-1', 1)).rejects.toBeInstanceOf(ConflictException);
  });

  it('treats a null limit as unlimited', async () => {
    given(null, 500, 50);
    await expect(service.assertAvailable('org-1', 10)).resolves.toBeUndefined();
  });

  it('rejects when the org is already over a lowered limit, without touching members', async () => {
    given(5, 12, 0);
    await expect(service.assertAvailable('org-1', 1)).rejects.toMatchObject({
      response: { code: 'SEAT_LIMIT_REACHED', seat: { active: 12, pending: 0, max: 5 } },
    });
  });
});
