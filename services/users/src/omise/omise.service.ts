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

/** Subset of an Omise card object we expose to the client. */
export interface OmiseCard {
  id: string;
  object: 'card';
  brand?: string;
  last_digits?: string;
  name?: string | null;
  expiration_month?: number | null;
  expiration_year?: number | null;
}

/** Subset of an Omise customer object we rely on. */
export interface OmiseCustomer {
  id: string;
  object: 'customer';
  default_card?: string | null;
  cards?: { data?: OmiseCard[] };
}

/** Omise list envelope. */
interface OmiseList<T> {
  object: 'list';
  data: T[];
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

  /** Form-encode a body and send with the given method; surfaces Omise errors. */
  private async send<T>(
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    try {
      const headers = this.authHeaders();
      const url = `${this.apiUrl}${path}`;
      let obs;
      if (method === 'get') {
        obs = this.httpService.get<T>(url, { headers });
      } else if (method === 'delete') {
        obs = this.httpService.delete<T>(url, { headers });
      } else {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(body ?? {})) {
          if (value !== undefined && value !== null) {
            params.append(key, String(value));
          }
        }
        obs =
          method === 'patch'
            ? this.httpService.patch<T>(url, params.toString(), { headers })
            : this.httpService.post<T>(url, params.toString(), { headers });
      }
      const { data } = await firstValueFrom(obs);
      return data;
    } catch (error) {
      const axiosError = error as AxiosError<{ message?: string }>;
      const message =
        axiosError.response?.data?.message ??
        axiosError.message ??
        'Omise request failed';
      this.logger.error(`Omise ${method.toUpperCase()} ${path} failed: ${message}`);
      throw new BadRequestException(message);
    }
  }

  /** Create an Omise customer and attach the given card token. */
  async createCustomer(input: {
    cardToken: string;
    email?: string;
    description?: string;
  }): Promise<OmiseCustomer> {
    return this.send<OmiseCustomer>('post', '/customers', {
      card: input.cardToken,
      email: input.email,
      description: input.description,
    });
  }

  /** Attach an additional card token to an existing customer. */
  async addCard(customerId: string, cardToken: string): Promise<OmiseCustomer> {
    return this.send<OmiseCustomer>('patch', `/customers/${customerId}`, {
      card: cardToken,
    });
  }

  /** List a customer's saved cards. */
  async listCards(customerId: string): Promise<OmiseCard[]> {
    const res = await this.send<OmiseList<OmiseCard>>(
      'get',
      `/customers/${customerId}/cards`,
    );
    return res.data ?? [];
  }

  /** Delete a saved card from a customer. */
  async deleteCard(customerId: string, cardId: string): Promise<void> {
    await this.send('delete', `/customers/${customerId}/cards/${cardId}`);
  }

  /**
   * Charge a customer's card (capture: true). When `cardId` is omitted, Omise
   * charges the customer's default card.
   */
  async chargeCustomerCard(input: {
    amountBaht: number;
    customerId: string;
    cardId?: string;
    description?: string;
    invoiceNo: string;
  }): Promise<OmiseCharge> {
    console.log('Charging customer card with input:', input);
    return this.send<OmiseCharge>('post', '/charges', {
      amount: this.toSatang(input.amountBaht),
      currency: 'thb',
      customer: input.customerId,
      card: input.cardId,
      description: input.description,
      capture: true,
      'metadata[invoiceNo]': input.invoiceNo,
    });
  }

  /** Charge a tokenized card immediately (capture: true). */
  async createCardCharge(input: {
    amountBaht: number;
    token: string;
    description?: string;
    invoiceNo: string;
  }): Promise<OmiseCharge> {
    console.log('Creating card charge with input:', input);
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
