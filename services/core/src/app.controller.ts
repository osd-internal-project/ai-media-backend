import { Controller, UseFilters } from '@nestjs/common';
import { AppErrorExceptionFilter } from '@ai-media/share';
import { InventoryService } from './app.service';

@UseFilters(AppErrorExceptionFilter)
@Controller('inventory')
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}
}
