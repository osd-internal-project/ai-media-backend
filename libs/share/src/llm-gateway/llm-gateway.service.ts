import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as https from 'https';
import {
  MasterdataModelTypeRepository,
  OrganizationRepository,
} from '../repositories';

/** Response body of `POST {llmGatewayUrl}/admin/api-keys`. */
export interface LlmApiKeyResponse {
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

/**
 * Mints and caches the per-organization LLM gateway API key stored on
 * `Organization.llmApiKey`.
 *
 * Shared by two callers with different timing:
 *  - `services/users` provisions eagerly when an organization is created.
 *  - `services/core` calls the same method lazily at generation time, which covers
 *    organizations created before eager provisioning existed or by paths that do not
 *    provision (invite-accept, `createOwner`).
 *
 * Every method is non-throwing — a gateway outage must never fail a signup or mask itself
 * as some other error at generate time.
 */
@Injectable()
export class LlmGatewayService {
  private readonly logger = new Logger(LlmGatewayService.name);

  constructor(
    private readonly organizationRepository: OrganizationRepository,
    private readonly masterdataModelTypeRepository: MasterdataModelTypeRepository,
  ) {}

  /**
   * Gateway settings.
   *
   * `libs/share` has no ConfigModule, so these are read straight from the environment on
   * every call rather than captured at construction time.
   */
  private get config() {
    const env = process.env.NODE_ENV ?? 'local';
    return {
      gatewayUrl: process.env.LLM_GATEWAY_URL || 'https://llm-gateway.aicave.ai',
      adminToken: process.env.LLM_ADMIN_TOKEN,
      projectId: process.env.LLM_PROJECT_ID || 'team-mrcx7er7',
      // Self-signed certificates are tolerated outside deployed environments only.
      rejectUnauthorized: !(env === 'local' || env === 'development'),
    };
  }

  /**
   * Returns the organization's gateway API key, minting and persisting one if absent.
   *
   * @param organizationId Organization UUID (`Organization.organizationId`).
   * @returns The API key, or null if the organization is unknown or provisioning failed.
   */
  async getOrCreateApiKey(organizationId: string): Promise<string | null> {
    if (!organizationId) return null;

    const organization = await this.organizationRepository
      .findOne({ where: { organizationId } })
      .catch((error) => {
        this.logger.error(
          `Failed to load organization ${organizationId}: ${error?.message}`,
        );
        return null;
      });

    if (!organization) {
      this.logger.warn(`Organization ${organizationId} not found`);
      return null;
    }
    if (organization.llmApiKey) {
      return organization.llmApiKey;
    }

    if (!this.config.adminToken) {
      this.logger.error(
        'LLM_ADMIN_TOKEN is not set — cannot provision a gateway API key',
      );
      return null;
    }

    const apiKey = await this.mintApiKey(organization.name);
    if (!apiKey) return null;

    return this.persistApiKey(organizationId, apiKey);
  }

  /**
   * Requests a new API key from the gateway.
   *
   * @param organizationName Used as the key's display name at the gateway.
   * @returns The minted key, or null when the gateway call fails.
   */
  private async mintApiKey(organizationName?: string): Promise<string | null> {
    const { gatewayUrl, adminToken, projectId, rejectUnauthorized } =
      this.config;

    const activeModels = await this.masterdataModelTypeRepository
      .findMany({ where: { isActive: true } })
      .catch((error) => {
        this.logger.error(`Failed to load active models: ${error?.message}`);
        return [];
      });

    const models = activeModels
      .map((model) => model.modelType)
      .filter((modelType): modelType is string => Boolean(modelType));

    try {
      const response = await axios.post<LlmApiKeyResponse>(
        `${gatewayUrl}/admin/api-keys`,
        {
          name: organizationName || 'Default Org Name',
          models,
          keyType: 'llm_api',
          ownedBy: 'you',
          teamId: projectId,
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
          httpsAgent: new https.Agent({ rejectUnauthorized }),
        },
      );

      const apiKey = response.data?.api_key;
      if (!apiKey) {
        this.logger.error(
          `Gateway returned no api_key: ${JSON.stringify(response.data)}`,
        );
        return null;
      }
      return apiKey;
    } catch (error) {
      this.logger.error(
        `Failed to mint LLM gateway key: ${error?.response?.status ?? ''} ${
          error?.message
        }`,
      );
      return null;
    }
  }

  /**
   * Persists a freshly minted key.
   *
   * The write is conditional on `llmApiKey` still being null so two concurrent callers
   * cannot overwrite each other; the loser re-reads and returns the winner's key. Kept
   * separate from {@link mintApiKey} so a persist failure is distinguishable from a gateway
   * failure — sharing one try/catch meant a failed write silently orphaned the minted key
   * and every retry minted another.
   *
   * @param organizationId Organization UUID.
   * @param apiKey The key returned by the gateway.
   * @returns The key now stored for the organization, or null if the write failed.
   */
  private async persistApiKey(
    organizationId: string,
    apiKey: string,
  ): Promise<string | null> {
    try {
      const result = await this.organizationRepository.updatemany({
        where: { organizationId, llmApiKey: null },
        data: { llmApiKey: apiKey },
      });

      if (result.count > 0) return apiKey;

      // Another caller won the race — return whatever they stored.
      const current = await this.organizationRepository.findOne({
        where: { organizationId },
      });
      return current?.llmApiKey ?? null;
    } catch (error) {
      this.logger.error(
        `Minted an LLM gateway key for ${organizationId} but failed to persist it: ${error?.message}`,
      );
      return null;
    }
  }
}
