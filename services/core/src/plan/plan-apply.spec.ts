import { BadRequestException } from '@nestjs/common';
import { matchesPlan } from '@ai-media/share';
import { parseApplyScope, pickTargets } from './plan-apply';

describe('plan apply to organizations', () => {
  const planBefore = { accessCodes: ['image', 'video'], allowedModelIds: [] };
  const orgs = [
    { organizationId: 'same', accessCodes: ['video', 'image'], allowedModelIds: [] },
    { organizationId: 'old-row', accessCodes: ['image', 'video'], allowedModelIds: null },
    { organizationId: 'custom', accessCodes: ['image', 'video', 'workflow'], allowedModelIds: [] },
  ];

  it('defaults to none when the field is missing (old clients)', () => {
    expect(parseApplyScope(undefined)).toBe('none');
    expect(parseApplyScope(null)).toBe('none');
    expect(() => parseApplyScope('everything')).toThrow(BadRequestException);
  });

  it('compares as sets and treats a null list as empty', () => {
    expect(matchesPlan(orgs[0], planBefore)).toBe(true);
    expect(matchesPlan(orgs[1], planBefore)).toBe(true);
    expect(matchesPlan(orgs[2], planBefore)).toBe(false);
  });

  it('matching skips orgs the admin customised; all takes every org; none takes nothing', () => {
    expect(pickTargets(orgs, planBefore, 'matching')).toEqual(['same', 'old-row']);
    expect(pickTargets(orgs, planBefore, 'all')).toEqual(['same', 'old-row', 'custom']);
    expect(pickTargets(orgs, planBefore, 'none')).toEqual([]);
  });
});
