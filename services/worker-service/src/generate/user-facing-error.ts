import { Prisma } from '@prisma/client';

export const GENERATE_FAILED_MESSAGE = 'Generate failed, please try again';

/** Message safe to send to the client: DB errors become generic, provider errors pass through. */
export const userFacingMessage = (err: Error): string =>
  err instanceof Prisma.PrismaClientKnownRequestError ||
  err instanceof Prisma.PrismaClientUnknownRequestError ||
  err instanceof Prisma.PrismaClientValidationError ||
  err instanceof Prisma.PrismaClientInitializationError ||
  err instanceof Prisma.PrismaClientRustPanicError
    ? GENERATE_FAILED_MESSAGE
    : err.message;
