import axios from 'axios';

const REFRESH_SKEW_SECONDS = 60;

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * BE-7: slack-agent no longer self-signs its JWT. It exchanges its client_id/client_secret for
 * a backend-issued access token via the client-credentials grant (`POST /auth/token`), caching
 * it in memory and refreshing shortly before it expires.
 */
export class BackendTokenProvider {
  readonly #baseURL: string;
  readonly #clientId: string;
  readonly #clientSecret: string;
  #cachedToken: string | null = null;
  #expiresAt = 0;

  constructor(baseURL: string, clientId: string, clientSecret: string) {
    this.#baseURL = baseURL;
    this.#clientId = clientId;
    this.#clientSecret = clientSecret;
  }

  async getToken(): Promise<string> {
    if (this.#cachedToken && Date.now() < this.#expiresAt) {
      return this.#cachedToken;
    }
    return this.#fetchToken();
  }

  async #fetchToken(): Promise<string> {
    const response = await axios.post<TokenResponse>(
      `${this.#baseURL}/auth/token`,
      {
        grant_type: 'client_credentials',
        client_id: this.#clientId,
        client_secret: this.#clientSecret,
      },
      { headers: { 'Content-Type': 'application/json' } },
    );
    this.#cachedToken = response.data.access_token;
    this.#expiresAt = Date.now() + (response.data.expires_in - REFRESH_SKEW_SECONDS) * 1000;
    return this.#cachedToken;
  }
}
