import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { MasteradataConfigApiService } from './masteradata-config-api.service';
import { Prisma } from '@prisma/client';

@Controller('masteradata-config-api')
export class MasteradataConfigApiController {
  constructor(
    private readonly masteradataConfigApiService: MasteradataConfigApiService,
  ) {}

  @Post()
  create(
    @Body('body')
    createMasteradataConfigApiDto: Prisma.MasterDataConfigApiCreateInput,
  ) {
    return this.masteradataConfigApiService.create(
      createMasteradataConfigApiDto,
    );
  }

  @Get()
  findAll() {
    return this.masteradataConfigApiService.findAll();
  }

  findForConfig() {
    return this.masteradataConfigApiService.findForConfig();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.masteradataConfigApiService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body('body')
    updateMasteradataConfigApiDto: Prisma.MasterDataConfigApiUpdateInput,
  ) {
    return this.masteradataConfigApiService.update(
      +id,
      updateMasteradataConfigApiDto,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.masteradataConfigApiService.remove(+id);
  }
}
