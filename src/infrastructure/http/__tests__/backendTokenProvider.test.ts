import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { BackendTokenProvider } from '../backendTokenProvider';

vi.mock('axios');

function tokenResponse(accessToken: string, expiresIn: number) {
  return {
    data: { access_token: accessToken, token_type: 'Bearer', expires_in: expiresIn },
  };
}

// BE-7: slack-agent exchanges client_id/client_secret for a backend-issued token via the
// client-credentials grant instead of self-signing its own JWT.
describe('BackendTokenProvider', () => {
  beforeEach(() => {
    vi.mocked(axios.post).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('POSTs client_credentials as a JSON body to /auth/token', async () => {
    vi.mocked(axios.post).mockResolvedValue(tokenResponse('tok-1', 3600));
    const provider = new BackendTokenProvider('http://backend/api/v1', 'client-a', 'secret-a');

    const token = await provider.getToken();

    expect(token).toBe('tok-1');
    expect(axios.post).toHaveBeenCalledWith(
      'http://backend/api/v1/auth/token',
      { grant_type: 'client_credentials', client_id: 'client-a', client_secret: 'secret-a' },
      { headers: { 'Content-Type': 'application/json' } },
    );
  });

  it('caches the token and does not re-fetch before it is close to expiring', async () => {
    vi.mocked(axios.post).mockResolvedValue(tokenResponse('tok-1', 3600));
    const provider = new BackendTokenProvider('http://backend/api/v1', 'client-a', 'secret-a');

    await provider.getToken();
    await provider.getToken();

    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  it('refreshes the token once it is within the refresh skew of expiring', async () => {
    vi.useFakeTimers();
    vi.mocked(axios.post)
      .mockResolvedValueOnce(tokenResponse('tok-1', 90))
      .mockResolvedValueOnce(tokenResponse('tok-2', 90));
    const provider = new BackendTokenProvider('http://backend/api/v1', 'client-a', 'secret-a');

    const first = await provider.getToken();
    vi.advanceTimersByTime(40_000); // 40s elapsed; expires_in 90s - 60s skew = 30s cache window
    const second = await provider.getToken();

    expect(first).toBe('tok-1');
    expect(second).toBe('tok-2');
    expect(axios.post).toHaveBeenCalledTimes(2);
  });
});
