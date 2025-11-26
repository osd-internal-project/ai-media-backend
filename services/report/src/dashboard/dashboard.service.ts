import { Injectable } from '@nestjs/common';
import { CreateDashboardDto } from './dto/create-dashboard.dto';
import { UpdateDashboardDto } from './dto/update-dashboard.dto';
import { generateExcelBuffer } from 'src/utils/excel';

@Injectable()
export class DashboardService {
  create(createDashboardDto: CreateDashboardDto) {
    return 'This action adds a new dashboard';
  }

  findAll() {
    return `This action returns all dashboard`;
  }
  testExport() {
    //Query Get Data
    const data = [
      { id: 1, name: 'Alice', age: 15 },
      { id: 2, name: 'Bob', age: 16 },
    ];
    return generateExcelBuffer(data, 'TestExcel');
  }
  findOne(id: number) {
    return `This action returns a #${id} dashboard`;
  }

  update(id: number, updateDashboardDto: UpdateDashboardDto) {
    return `This action updates a #${id} dashboard`;
  }

  remove(id: number) {
    return `This action removes a #${id} dashboard`;
  }
}
