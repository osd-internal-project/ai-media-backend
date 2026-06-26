import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import config from '../configs';

/** Internet-banking bank codes supported by the checkout flow. */
export type OmiseBank = 'bay' | 'bbl' | 'kbank' | 'ktb' | 'scb';

/** Subset of an Omise source object that we rely on. */
interface OmiseScannableCode {
  image?: { download_uri?: string };
}

interface OmiseSource {
  id: string;
  type: string;
  scannable_code?: OmiseScannableCode;
}

/** Subset of an Omise charge object that we rely on. */
export interface OmiseCharge {
  id: string;
  object: 'charge';
  status: 'successful' | 'pending' | 'failed' | 'expired' | 'reversed';
  paid: boolean;
  amount: number;
  currency: string;
  authorize_uri?: string | null;
  failure_message?: string | null;
  failure_code?: string | null;
  source?: OmiseSource | null;
  metadata?: Record<string, unknown>;
}

/**
 * Thin wrapper around the Omise REST API using the shared HttpModule.
 * No SDK dependency — calls https://api.omise.co with HTTP Basic auth.
 */
@Injectable()
export class OmiseService {
  private readonly logger = new Logger(OmiseService.name);
  private readonly apiUrl = config().omise.apiUrl;
  private readonly apiVersion = config().omise.apiVersion;

  constructor(private readonly httpService: HttpService) {}

  /** Convert a THB baht amount to satang (integer) as required by Omise. */
  private toSatang(amountBaht: number): number {
    return Math.round(amountBaht * 100);
  }

  /** Build the Basic-auth + version headers; throws if the secret key is missing. */
  private authHeaders(): Record<string, string> {
    const secretKey = config().omise.secretKey;
    if (!secretKey) {
      throw new InternalServerErrorException(
        'Omise secret key is not configured',
      );
    }
    const token = Buffer.from(`${secretKey}:`).toString('base64');
    return {
      Authorization: `Basic ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Omise-Version': this.apiVersion,
    };
  }

  /** POST helper that surfaces Omise error messages as BadRequest. */
  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    try {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(body)) {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      }
      const { data } = await firstValueFrom(
        this.httpService.post<T>(`${this.apiUrl}${path}`, params.toString(), {
          headers: this.authHeaders(),
        }),
      );
      return data;
    } catch (error) {
      const axiosError = error as AxiosError<{ message?: string }>;
      const message =
        axiosError.response?.data?.message ?? axiosError.message ?? 'Omise request failed';
      this.logger.error(`Omise POST ${path} failed: ${message}`);
      throw new BadRequestException(message);
    }
  }

  /** Charge a tokenized card immediately (capture: true). */
  async createCardCharge(input: {
    amountBaht: number;
    token: string;
    description?: string;
    invoiceNo: string;
  }): Promise<OmiseCharge> {
    return this.post<OmiseCharge>('/charges', {
      amount: this.toSatang(input.amountBaht),
      currency: 'thb',
      card: input.token,
      description: input.description,
      capture: true,
      'metadata[invoiceNo]': input.invoiceNo,
    });
  }

  /**
   * Create a source (PromptPay / internet banking) then a charge for it.
   * For internet banking the returned charge carries an `authorize_uri`;
   * for PromptPay it carries a scannable QR download uri.
   */
  async createSourceCharge(input: {
    amountBaht: number;
    type: string; // 'promptpay' | 'internet_banking_<bank>'
    returnUri?: string;
    description?: string;
    invoiceNo: string;
  }): Promise<OmiseCharge> {
    const amount = this.toSatang(input.amountBaht);
    const source = await this.post<OmiseSource>('/sources', {
      amount,
      currency: 'thb',
      type: input.type,
    });
    return this.post<OmiseCharge>('/charges', {
      amount,
      currency: 'thb',
      source: source.id,
      description: input.description,
      return_uri: input.returnUri,
      'metadata[invoiceNo]': input.invoiceNo,
    });
  }

  /** Read the QR image uri from a PromptPay charge, if present. */
  getQrImageUri(charge: OmiseCharge): string | null {
    return charge.source?.scannable_code?.image?.download_uri ?? null;
  }

  /** Retrieve the latest state of a charge (used by webhook verification + polling). */
  async retrieveCharge(chargeId: string): Promise<OmiseCharge> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<OmiseCharge>(`${this.apiUrl}/charges/${chargeId}`, {
          headers: this.authHeaders(),
        }),
      );
      return data;
    } catch (error) {
      const axiosError = error as AxiosError<{ message?: string }>;
      const message =
        axiosError.response?.data?.message ?? axiosError.message ?? 'Omise request failed';
      this.logger.error(`Omise GET /charges/${chargeId} failed: ${message}`);
      throw new BadRequestException(message);
    }
  }
}
