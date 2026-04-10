import { Injectable } from '@nestjs/common';
import { MasterdataModelTypeRepository } from '@ai-media/share';

@Injectable()
export class AiModelService {
  constructor(
    private readonly masterModelTypeRepository: MasterdataModelTypeRepository,
  ) {}

  async findAll(type?: string) {
    try {
      console.log(
        'this.masterModelTypeRepository',
        this.masterModelTypeRepository,
      );
      const models = await this.masterModelTypeRepository.findMany({
        where: {
          ...(type && { type: type }),
          // modelDetails: { path: ['status'], equals: 'Activated' },
        },
        orderBy: { id: 'asc' },
      });
      console.log('models', models);

      // Map database fields to frontend expected format

      return {
        success: true,
        message: 'AI models retrieved successfully',
        data: models,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to retrieve AI models',
        data: [],
      };
    }
  }

  async findById(id: number) {
    try {
      const model = await this.masterModelTypeRepository.findOne({
        where: { id },
      });

      if (!model) {
        return {
          success: false,
          message: 'AI model not found',
          data: null,
        };
      }

      // Map database fields to frontend expected format
      const mappedModel = {
        id: model.id,
        name: model.modelType,
        type: model.type,
        mode: model.description,
        isDefault: model.isDefault,
        modelDetails: model.modelDetails,
        createdAt: model.createdAt,
        updatedAt: model.updatedAt,
      };

      return {
        success: true,
        message: 'AI model retrieved successfully',
        data: mappedModel,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to retrieve AI model',
        data: null,
      };
    }
  }
}
