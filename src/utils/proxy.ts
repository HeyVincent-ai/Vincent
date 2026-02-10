/**
 * Webshare Proxy Utility
 *
 * Fetches proxy credentials from Webshare and configures axios to use them
 * for specific domains (e.g., Polymarket which geo-blocks US requests).
 */

import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { env } from './env.js';

interface WebshareProxy {
  id: string;
  username: string;
  password: string;
  proxy_address: string;
  port: number;
  valid: boolean;
  country_code: string;
  city_name: string;
}

interface WebshareResponse {
  count: number;
  results: WebshareProxy[];
}

let cachedProxyUrl: string | null = null;
let cacheExpiry: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch a proxy from Webshare API.
 * Returns proxy URL in format: http://username:password@host:port
 */
export async function getWebshareProxy(): Promise<string | null> {
  if (!env.WEBSHARE_API_KEY) {
    return null;
  }

  // Return cached proxy if still valid
  if (cachedProxyUrl && Date.now() < cacheExpiry) {
    return cachedProxyUrl;
  }

  try {
    const response = await axios.get<WebshareResponse>(
      'https://proxy.webshare.io/api/v2/proxy/list/?mode=direct&page=1&page_size=10',
      {
        headers: {
          Authorization: `Token ${env.WEBSHARE_API_KEY}`,
        },
      }
    );

    const proxies = response.data.results.filter((p) => p.valid);
    if (proxies.length === 0) {
      console.warn('[Proxy] No valid proxies available from Webshare');
      return null;
    }

    // Pick a random valid proxy
    const proxy = proxies[Math.floor(Math.random() * proxies.length)];
    const proxyUrl = `http://${proxy.username}:${proxy.password}@${proxy.proxy_address}:${proxy.port}`;

    console.log(
      `[Proxy] Using Webshare proxy: ${proxy.proxy_address}:${proxy.port} (${proxy.country_code})`
    );

    // Cache the proxy
    cachedProxyUrl = proxyUrl;
    cacheExpiry = Date.now() + CACHE_TTL_MS;

    return proxyUrl;
  } catch (error) {
    console.error('[Proxy] Failed to fetch Webshare proxy:', error);
    return null;
  }
}

/**
 * Create an HttpsProxyAgent for use with axios or other HTTP clients.
 */
export async function getProxyAgent(): Promise<HttpsProxyAgent<string> | undefined> {
  const proxyUrl = await getWebshareProxy();
  if (!proxyUrl) {
    return undefined;
  }
  return new HttpsProxyAgent(proxyUrl);
}

/**
 * Configure axios to use Webshare proxy for requests to specific hosts.
 * Call this once at app startup.
 */
export async function configureAxiosProxy(targetHosts: string[]): Promise<void> {
  const proxyUrl = await getWebshareProxy();
  if (!proxyUrl) {
    console.log('[Proxy] No proxy configured - requests will go direct');
    return;
  }

  const agent = new HttpsProxyAgent(proxyUrl);

  // Add axios request interceptor to use proxy for matching hosts
  axios.interceptors.request.use(
    (config) => {
      const url = config.url || '';
      const shouldProxy = targetHosts.some(
        (host) => url.includes(host) || config.baseURL?.includes(host)
      );

      if (shouldProxy) {
        config.httpsAgent = agent;
        config.httpAgent = agent;
        // Disable proxy env vars for this request (we're handling it manually)
        config.proxy = false;
      }

      return config;
    },
    (error) => Promise.reject(error)
  );

  console.log(`[Proxy] Axios configured to proxy requests to: ${targetHosts.join(', ')}`);
}

/**
 * Initialize proxy for Polymarket API calls.
 * This should be called before any Polymarket write operations.
 */
let polymarketProxyInitialized = false;

export async function initializePolymarketProxy(): Promise<void> {
  if (polymarketProxyInitialized) {
    return;
  }

  if (!env.WEBSHARE_API_KEY) {
    console.log('[Proxy] WEBSHARE_API_KEY not set - Polymarket requests will go direct');
    return;
  }

  await configureAxiosProxy(['clob.polymarket.com', 'polymarket.com']);
  polymarketProxyInitialized = true;
}
