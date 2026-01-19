import { Injectable } from '@nestjs/common';

@Injectable()
export class GenerateService {
    async validateError() {
        return new Error('Test Error');
    }
}
