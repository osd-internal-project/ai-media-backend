import {
  GalleryRepository,
  LogRepository,
  MasterdataModelTypeRepository,
  MasterModelTypeDto,
} from '@ai-media/share';
import { Logger } from '@nestjs/common';
import axios, { AxiosRequestConfig } from 'axios';
import { Queue } from 'bullmq';
import { llmConfigs } from 'src/configs';

import * as https from 'https';
import Redis from 'ioredis';
import { GenerateHelperService } from './generate-helper.service';
import { OrganizationRepository } from '@ai-media/share';

export interface LlmApiKeyResponse {
  //Generate API Key Responsive
  success: boolean;
  api_key: string;
  key_id: string;
  name: string;
  team: string;
  teamAlias: string;
  user: string;
  models: string[];
  keyType: 'llm_api';
  ownedBy: string;
  budgetLimit?: number;
  budgetWindow: 'daily' | 'weekly' | 'monthly';
  createdBy: string;
  created: string;
  message: string;
}

// export interface LlmApiKeyRequest {}

export abstract class LlmGatewayService {
  protected readonly agent = new https.Agent({ rejectUnauthorized: false });

  constructor(
    protected readonly generateHelperService: GenerateHelperService,
    protected readonly organizationRepository: OrganizationRepository,
  ) {}
  private readonly llmConfig = llmConfigs();
  private readonly llmModels = [
    'byteplus-omnihuman',
    'byteplus-dreamactor',
    'seedance-1-5-pro-251215',
    'seedream-4-5-251128',
  ];
  async getLlmGatewayApiKey(organizationId: string): Promise<string | null> {
    const org = await this.organizationRepository.findOne({
      where: { organizationId },
    });
    if (org && org?.llmApiKey) {
      return org.llmApiKey;
    }

    try {
      const newKey: { data: LlmApiKeyResponse } = await axios.post(
        `${this.llmConfig.llmGatewayUrl}/admin/api-keys`,
        {
          headers: {
            Authorization: `${this.llmConfig.llmAdminToken}`,
          },
          body: {
            name: org?.name || 'Default Org Name',
            models: this.llmModels,
            keyType: 'llm_api',
            ownedBy: 'you',
            teamId: llmConfigs().llmProjectId,
          },
        },
        {
          httpsAgent: this.agent,
        },
      );
      const { api_key } = newKey.data;
      const updatedOrg = await this.organizationRepository.update({
        where: { organizationId },
        data: { llmApiKey: api_key },
      });

      return updatedOrg.llmApiKey;
    } catch (error) {
      console.error('Error creating  LLM Gateway Key:', error);
      return null;
    }
  }
}
