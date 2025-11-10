import { Injectable } from '@nestjs/common';
import { PrismaService } from '../modules/prisma/prisma.service';
@Injectable()
export class AccessService {
  constructor(private prisma: PrismaService) {}

  //หา User จาก Token
  async findUserByToken(token: string) {
    return this.prisma.users.findFirst({
      where: { token: token },
    });
  }
}
