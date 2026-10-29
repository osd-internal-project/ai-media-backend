import { Prisma } from '@prisma/client';
import {
  GENERATE_FAILED_MESSAGE,
  userFacingMessage,
} from './user-facing-error';

describe('userFacingMessage', () => {
  it('hides a Prisma raw-query error behind the generic message', () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      'Invalid `prisma.$executeRaw()` invocation: Raw query failed. Code: `22P03`.',
      { code: 'P2010', clientVersion: '4.16.2' },
    );

    expect(userFacingMessage(err)).toBe(GENERATE_FAILED_MESSAGE);
  });

  it('passes a provider error through unchanged', () => {
    const err = new Error(
      'The request failed because the input text may contain sensitive information.',
    );

    expect(userFacingMessage(err)).toBe(err.message);
  });
});
