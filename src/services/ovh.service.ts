/**
 * OVH API Service
 *
 * Wraps the OVH API for VPS lifecycle management:
 * - Cart-based VPS ordering
 * - Order status polling
 * - VPS details retrieval (IP, state)
 * - SSH key management
 * - VPS termination
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Ovh = require('@ovhcloud/node-ovh');
import { env } from '../utils/env.js';

// ============================================================
// Types
// ============================================================

export interface OvhOrderResult {
  orderId: number;
  url: string;
}

export interface OvhOrderStatus {
  orderId: number;
  status: string;
  date: string;
}

export interface OvhVpsDetails {
  name: string;
  displayname: string;
  state: string;
  ips: string[];
  memory: number;
  vcore: number;
  zone: string;
}

export interface OvhVpsIp {
  ipAddress: string;
  type: string;
}

interface OvhClient {
  requestPromised(method: string, path: string, body?: any): Promise<any>;
}

// ============================================================
// Client singleton
// ============================================================

let client: OvhClient | null = null;

function getClient(): OvhClient {
  if (!client) {
    if (!env.OVH_APP_KEY || !env.OVH_APP_SECRET || !env.OVH_CONSUMER_KEY) {
      throw new Error('OVH API credentials not configured (OVH_APP_KEY, OVH_APP_SECRET, OVH_CONSUMER_KEY)');
    }
    client = Ovh({
      endpoint: env.OVH_ENDPOINT || 'ovh-us',
      appKey: env.OVH_APP_KEY,
      appSecret: env.OVH_APP_SECRET,
      consumerKey: env.OVH_CONSUMER_KEY,
    });
  }
  return client!;
}

// ============================================================
// VPS Ordering
// ============================================================

/**
 * Order a new VPS through the OVH cart system.
 *
 * Flow: create cart → assign → add VPS item → configure datacenter + OS → checkout
 */
export async function orderVps(options: {
  planCode: string;
  datacenter: string;
  os: string;
  autoPayWithPreferredPaymentMethod?: boolean;
}): Promise<OvhOrderResult> {
  const ovh = getClient();
  const {
    planCode,
    datacenter,
    os,
    autoPayWithPreferredPaymentMethod = true,
  } = options;

  // Step 1: Create cart
  const cart = await ovh.requestPromised('POST', '/order/cart', {
    ovhSubsidiary: 'US',
    description: `OpenClaw VPS - ${planCode}`,
  });
  const cartId = cart.cartId;

  // Step 2: Assign cart to account
  await ovh.requestPromised('POST', `/order/cart/${cartId}/assign`);

  // Step 3: Add VPS to cart
  const item = await ovh.requestPromised('POST', `/order/cart/${cartId}/vps`, {
    duration: 'P1M',
    planCode,
    pricingMode: 'default',
    quantity: 1,
  });
  const itemId = item.itemId;

  // Step 4: Get required configuration labels
  const requiredConfig: Array<{ label: string; type: string; fields: string[]; required: boolean }> =
    await ovh.requestPromised('GET', `/order/cart/${cartId}/item/${itemId}/requiredConfiguration`);

  // Step 5: Configure datacenter and OS
  const dcLabel = requiredConfig.find(c => c.label.includes('datacenter'))?.label || 'vps_datacenter';
  const osLabel = requiredConfig.find(c => c.label.includes('os'))?.label || 'vps_os';

  await ovh.requestPromised('POST', `/order/cart/${cartId}/item/${itemId}/configuration`, {
    label: dcLabel,
    value: datacenter,
  });

  await ovh.requestPromised('POST', `/order/cart/${cartId}/item/${itemId}/configuration`, {
    label: osLabel,
    value: os,
  });

  // Step 6: Checkout
  const order = await ovh.requestPromised('POST', `/order/cart/${cartId}/checkout`, {
    autoPayWithPreferredPaymentMethod,
    waiveRetractationPeriod: false,
  });

  return {
    orderId: order.orderId,
    url: order.url,
  };
}

// ============================================================
// Order Status
// ============================================================

/**
 * Get the status of an order.
 */
export async function getOrderStatus(orderId: number): Promise<OvhOrderStatus> {
  const ovh = getClient();
  const order = await ovh.requestPromised('GET', `/me/order/${orderId}`);
  return {
    orderId: order.orderId,
    status: order.orderstatus || order.orderStatus,
    date: order.date,
  };
}

/**
 * Get the service name associated with an order once delivered.
 * Returns null if not yet associated.
 */
export async function getOrderAssociatedService(orderId: number): Promise<string | null> {
  const ovh = getClient();
  try {
    const details = await ovh.requestPromised('GET', `/me/order/${orderId}/details`);
    if (Array.isArray(details) && details.length > 0) {
      // Each detail ID can give us the domain/service
      for (const detailId of details) {
        const detail = await ovh.requestPromised('GET', `/me/order/${orderId}/details/${detailId}`);
        if (detail.domain) return detail.domain;
      }
    }
  } catch {
    // Order may not have associated details yet
  }

  // Fallback: check if any new VPS appeared
  return null;
}

// ============================================================
// VPS Management
// ============================================================

/**
 * List all VPS service names on the account.
 */
export async function listVps(): Promise<string[]> {
  const ovh = getClient();
  return ovh.requestPromised('GET', '/vps');
}

/**
 * Get VPS details including IPs and state.
 */
export async function getVpsDetails(serviceName: string): Promise<OvhVpsDetails> {
  const ovh = getClient();
  const vps = await ovh.requestPromised('GET', `/vps/${serviceName}`);
  return {
    name: vps.name,
    displayname: vps.displayname,
    state: vps.state,
    ips: vps.ips || [],
    memory: vps.memory,
    vcore: vps.vcore,
    zone: vps.zone,
  };
}

/**
 * Get the IP addresses attached to a VPS.
 */
export async function getVpsIps(serviceName: string): Promise<string[]> {
  const ovh = getClient();
  return ovh.requestPromised('GET', `/vps/${serviceName}/ips`);
}

/**
 * Reboot a VPS.
 */
export async function rebootVps(serviceName: string): Promise<void> {
  const ovh = getClient();
  await ovh.requestPromised('POST', `/vps/${serviceName}/reboot`);
}

/**
 * Terminate a VPS (request termination).
 */
export async function terminateVps(serviceName: string): Promise<void> {
  const ovh = getClient();
  await ovh.requestPromised('POST', `/vps/${serviceName}/terminate`);
}

/**
 * Rebuild a VPS with a new image and SSH key.
 * Uses publicSshKey (raw content) + doNotSendPassword to avoid forced
 * password change on first login. The key is injected for the default
 * non-root user (e.g. "debian" on Debian, "ubuntu" on Ubuntu).
 */
export async function rebuildVps(
  serviceName: string,
  imageId: string,
  sshPublicKey: string,
): Promise<{ id: number; state: string; type: string }> {
  const ovh = getClient();
  return ovh.requestPromised('POST', `/vps/${serviceName}/rebuild`, {
    imageId,
    publicSshKey: sshPublicKey,
    doNotSendPassword: true,
  });
}

/**
 * List available images for a VPS (returns image IDs).
 */
export async function getAvailableImages(serviceName: string): Promise<string[]> {
  const ovh = getClient();
  return ovh.requestPromised('GET', `/vps/${serviceName}/images/available`);
}

/**
 * Get details of an available image.
 */
export async function getImageDetails(
  serviceName: string,
  imageId: string,
): Promise<{ id: string; name: string }> {
  const ovh = getClient();
  return ovh.requestPromised('GET', `/vps/${serviceName}/images/available/${imageId}`);
}

// ============================================================
// SSH Key Management
// ============================================================

/**
 * Register an SSH public key with OVH.
 */
export async function addSshKey(keyName: string, publicKey: string): Promise<void> {
  const ovh = getClient();
  await ovh.requestPromised('POST', '/me/sshKey', {
    keyName,
    key: publicKey,
  });
}

/**
 * Delete an SSH key from OVH.
 */
export async function deleteSshKey(keyName: string): Promise<void> {
  const ovh = getClient();
  await ovh.requestPromised('DELETE', `/me/sshKey/${keyName}`);
}

/**
 * List all SSH key names on the account.
 */
export async function listSshKeys(): Promise<string[]> {
  const ovh = getClient();
  return ovh.requestPromised('GET', '/me/sshKey');
}

// ============================================================
// Catalog / Availability
// ============================================================

/**
 * Check available datacenters for a VPS plan.
 */
export async function getAvailableDatacenters(planCode: string): Promise<any> {
  const ovh = getClient();
  return ovh.requestPromised(
    'GET',
    `/vps/order/rule/datacenter?ovhSubsidiary=US&planCode=${planCode}`,
  );
}

/**
 * Find the first in-stock datacenter for a plan.
 * Returns the datacenter name or null if all are out of stock.
 */
export async function findAvailableDatacenter(planCode: string): Promise<string | null> {
  const result = await getAvailableDatacenters(planCode);
  if (!result?.datacenters) return null;
  const available = result.datacenters.find(
    (dc: any) => dc.linuxStatus === 'available',
  );
  return available?.datacenter || null;
}

/**
 * Get the allowed datacenter values for a plan via the cart API.
 * This returns the values accepted by the configuration endpoint,
 * which may differ from the availability/stock endpoint.
 */
export async function getCartDatacenters(planCode: string): Promise<string[]> {
  const ovh = getClient();
  const cart = await ovh.requestPromised('POST', '/order/cart', {
    ovhSubsidiary: 'US',
    description: 'datacenter check',
  });
  await ovh.requestPromised('POST', `/order/cart/${cart.cartId}/assign`);
  try {
    const item = await ovh.requestPromised('POST', `/order/cart/${cart.cartId}/vps`, {
      duration: 'P1M',
      planCode,
      pricingMode: 'default',
      quantity: 1,
    });
    const reqConfig = await ovh.requestPromised(
      'GET',
      `/order/cart/${cart.cartId}/item/${item.itemId}/requiredConfiguration`,
    );
    const dcConfig = reqConfig.find((c: any) => c.label.includes('datacenter'));
    return dcConfig?.allowedValues || [];
  } catch {
    return [];
  }
}

/**
 * Check available OS choices for a VPS plan via the catalog.
 * Uses the public order catalog which includes OS options per plan.
 */
export async function getAvailableOs(planCode: string): Promise<string[]> {
  // The OS list comes from the cart's requiredConfiguration endpoint.
  // We use the catalog endpoint here for a quick check.
  const ovh = getClient();
  const catalog = await ovh.requestPromised('GET', '/order/catalog/public/vps?ovhSubsidiary=US');
  const plan = catalog.plans?.find((p: any) => p.planCode === planCode);
  if (!plan) return [];
  // Extract OS names from addon families or configurations
  const osAddon = plan.addonFamilies?.find((f: any) => f.name === 'os');
  return osAddon?.addons || [];
}

/**
 * Verify OVH API credentials by calling /me.
 */
export async function getAccountInfo(): Promise<any> {
  const ovh = getClient();
  return ovh.requestPromised('GET', '/me');
}
