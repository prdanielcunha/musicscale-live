import type {
  CommandResult,
  LiveCommand,
  LiveDropAsset,
  LiveNodeHealth,
  LiveNodeRuntimeState,
  LiveRequest,
  PairingChallenge,
  PairingCompleteResponse,
  PairingRequest,
  ProviderLink,
  ProviderRouteGroup,
  Scene,
  SceneExecutionRequest,
  SceneExecutionResult,
  ServicePlan,
  SignalTopology
} from '@millionsnest/live-domain';

export interface PeerNodeStatus {
  nodeId: string;
  displayName: string;
  baseUrl: string;
  health: 'online' | 'degraded' | 'offline';
  providers: number;
  providersOnline: number;
  lastSeenAt?: string;
}

export interface PeerNodePairingChallenge {
  remoteNodeId: string;
  baseUrl: string;
  challengeId: string;
  expiresAt: string;
  method: 'pin';
  displayedOnRemoteNode: true;
}

export interface DiscoveredLiveNode {
  nodeId: string;
  displayName: string;
  baseUrl: string;
  address: string;
  port: number;
  version?: string;
  lastSeenAt: string;
}

export interface PeerDiscoveryResponse {
  status: 'idle' | 'starting' | 'online' | 'unavailable';
  peers: DiscoveredLiveNode[];
}

export interface LiveNodeStateResponse {
  nodeId: string;
  state: LiveNodeRuntimeState;
  providers: Array<{
    providerId: string;
    nodeId?: string;
    displayName?: string;
    providerKey?: string;
    kind?: string;
    capabilities: string[];
    health: string;
    observed?: Record<string, unknown>;
  }>;
  routing?: Partial<Record<ProviderRouteGroup, string>>;
  peers?: PeerNodeStatus[];
  signalTopology?: SignalTopology;
  liveDrop?: LiveDropAsset[];
}

export class LiveNodeApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message = code
  ) {
    super(message);
  }
}

function ipv4IsPrivate(hostname: string): boolean {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)) {
    return false;
  }
  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 172 && (octets[1] ?? 0) >= 16 && (octets[1] ?? 0) <= 31)
  );
}

export function normalizePrivateNodeUrl(input: string): string {
  const value = input.trim();
  const withProtocol = /^https?:\/\//i.test(value) ? value : `http://${value}`;
  const url = new URL(withProtocol);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported_node_protocol');

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const allowed =
    host === 'localhost' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.startsWith('fe80:') ||
    host.startsWith('fc') ||
    host.startsWith('fd') ||
    ipv4IsPrivate(host);

  if (!allowed) throw new Error('node_must_be_local');
  url.pathname = '';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function targetAddressSpaceFor(baseUrl: string): 'local' | 'loopback' | undefined {
  const host = new URL(baseUrl).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '::1' || host.startsWith('127.')) return 'loopback';
  return 'local';
}

function browserSupportsLocalNetworkAccess(): boolean {
  return typeof Request !== 'undefined' && 'targetAddressSpace' in Request.prototype;
}

async function requestJson<T>(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
  timeoutMs = 3500
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const networkInit = {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
      targetAddressSpace: targetAddressSpaceFor(baseUrl),
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers || {})
      }
    } as RequestInit & { targetAddressSpace?: 'local' | 'loopback' };
    const response = await fetch(`${baseUrl}${path}`, networkInit);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new LiveNodeApiError(
        String(body?.error || 'node_request_failed'),
        response.status
      );
    }
    return body as T;
  } catch (error) {
    if (error instanceof LiveNodeApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new LiveNodeApiError('node_timeout', 0);
    }
    throw new LiveNodeApiError('node_unreachable', 0);
  } finally {
    window.clearTimeout(timeout);
  }
}

export function mixedContentWouldBlock(baseUrl: string): boolean {
  if (window.location.protocol !== 'https:' || new URL(baseUrl).protocol !== 'http:') {
    return false;
  }
  return !browserSupportsLocalNetworkAccess();
}

export async function probeNode(baseUrlInput: string): Promise<LiveNodeHealth> {
  const baseUrl = normalizePrivateNodeUrl(baseUrlInput);
  return requestJson<LiveNodeHealth>(baseUrl, '/health', {}, 2500);
}

export async function requestPairing(
  baseUrlInput: string,
  request: PairingRequest
): Promise<PairingChallenge> {
  const baseUrl = normalizePrivateNodeUrl(baseUrlInput);
  return requestJson<PairingChallenge>(baseUrl, '/pairing/request', {
    method: 'POST',
    body: JSON.stringify(request)
  });
}

export async function completePairing(
  baseUrlInput: string,
  request: {
    challengeId: string;
    pin: string;
    deviceId: string;
    deviceName: string;
  }
): Promise<PairingCompleteResponse> {
  const baseUrl = normalizePrivateNodeUrl(baseUrlInput);
  return requestJson<PairingCompleteResponse>(baseUrl, '/pairing/complete', {
    method: 'POST',
    body: JSON.stringify(request)
  });
}

export async function heartbeatNode(baseUrl: string, token: string): Promise<{
  nodeId: string;
  now: string;
  stateRevision: number;
}> {
  return requestJson(baseUrl, '/heartbeat', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: '{}'
  }, 2200);
}

export async function loadNodeState(
  baseUrl: string,
  token: string
): Promise<LiveNodeStateResponse> {
  return requestJson<LiveNodeStateResponse>(baseUrl, '/state', {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function revokeNodePairing(
  baseUrl: string,
  token: string,
  deviceId: string
): Promise<void> {
  await requestJson(baseUrl, '/pairing/revoke', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ deviceId })
  });
}

export async function discoverPeerNodes(
  baseUrl: string,
  token: string
): Promise<PeerDiscoveryResponse> {
  return requestJson<PeerDiscoveryResponse>(baseUrl, '/discovery/peers', {
    headers: { Authorization: `Bearer ${token}` }
  }, 3000);
}

export async function requestPeerNodePairing(
  baseUrl: string,
  token: string,
  peerBaseUrl: string
): Promise<PeerNodePairingChallenge> {
  return requestJson(baseUrl, '/peers/pair/request', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ baseUrl: peerBaseUrl })
  }, 5000);
}

export async function completePeerNodePairing(
  baseUrl: string,
  token: string,
  remoteNodeId: string,
  pin: string
): Promise<{ peer: PeerNodeStatus }> {
  return requestJson(baseUrl, '/peers/pair/complete', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      remoteNodeId,
      pin: pin.replace(/\D/g, '').slice(0, 6)
    })
  }, 5000);
}

export async function removePeerNode(
  baseUrl: string,
  token: string,
  remoteNodeId: string
): Promise<{ removed: boolean; peers: PeerNodeStatus[] }> {
  return requestJson(baseUrl, `/peers/${encodeURIComponent(remoteNodeId)}/remove`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: '{}'
  }, 5000);
}

export async function setNodeProviderRoute(
  baseUrl: string,
  token: string,
  group: ProviderRouteGroup,
  providerId: string | null
): Promise<{
  group: ProviderRouteGroup;
  providerId: string | null;
  routing: Partial<Record<ProviderRouteGroup, string>>;
}> {
  return requestJson(baseUrl, '/routing', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ group, providerId })
  }, 5000);
}


export async function saveNodeSignalTopology(
  baseUrl: string,
  token: string,
  topology: Pick<SignalTopology, 'endpoints' | 'links'>
): Promise<{ nodeId: string; topology: SignalTopology }> {
  return requestJson(baseUrl, '/signal-topology', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(topology)
  }, 5000);
}


export async function executeNodeCommand(
  baseUrl: string,
  token: string,
  command: LiveCommand,
  confirmed = false
): Promise<{ correlationId: string; results: CommandResult[] }> {
  const guardedHeaders: Record<string, string> =
    confirmed && (command.safetyLevel === 'guarded' || command.safetyLevel === 'critical')
      ? { 'x-live-confirmation': command.id }
      : {};

  return requestJson(baseUrl, '/commands', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      ...guardedHeaders
    },
    body: JSON.stringify(command)
  }, 5000);
}


export async function executeNodeScene(
  baseUrl: string,
  token: string,
  request: SceneExecutionRequest,
  confirmed = false
): Promise<SceneExecutionResult> {
  const guarded = request.scene.actions.some(
    action => action.safetyLevel === 'guarded' || action.safetyLevel === 'critical'
  );

  return requestJson<SceneExecutionResult>(baseUrl, '/scenes/execute', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(guarded && confirmed ? { 'x-live-confirmation': request.id } : {})
    },
    body: JSON.stringify(request)
  }, 70_000);
}

export async function cacheNodeServicePlan(
  baseUrl: string,
  token: string,
  plan: ServicePlan,
  providerLinks: ProviderLink[] = []
): Promise<{ nodeId: string; servicePlanId: string; providerLinks: number; stateRevision: number }> {
  return requestJson(baseUrl, '/service-plan', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ plan, providerLinks })
  }, 5000);
}

export async function detectSameOriginLiveNode(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 1200);
  try {
    for (const path of [
      '/.well-known/musicscale-live-node',
      '/.well-known/millionsnest-live-node'
    ]) {
      const response = await fetch(path, {
        cache: 'no-store',
        signal: controller.signal
      }).catch(() => null);
      if (!response?.ok) continue;
      const body = await response.json().catch(() => null);
      if (
        body?.product === 'MusicScale Live Node' ||
        body?.product === 'MillionsNest Live Node'
      ) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}


export async function fetchProviderOutputSnapshot(
  baseUrl: string,
  token: string,
  providerId: string,
  targetId: string,
  format: 'jpeg' | 'png' = 'jpeg'
): Promise<Blob> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5000);
  try {
    const networkInit = {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      targetAddressSpace: targetAddressSpaceFor(baseUrl),
      headers: {
        Authorization: `Bearer ${token}`
      }
    } as RequestInit & { targetAddressSpace?: 'local' | 'loopback' };

    const url =
      `${baseUrl}/provider-assets/${encodeURIComponent(providerId)}/output-snapshot` +
      `?targetId=${encodeURIComponent(targetId)}&format=${format}`;

    const response = await fetch(url, networkInit);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new LiveNodeApiError(
        String(body?.error || 'provider_asset_failed'),
        response.status
      );
    }
    return response.blob();
  } catch (error) {
    if (error instanceof LiveNodeApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new LiveNodeApiError('provider_asset_timeout', 0);
    }
    throw new LiveNodeApiError('provider_asset_unreachable', 0);
  } finally {
    window.clearTimeout(timeout);
  }
}


export async function listNodeLiveDrop(
  baseUrl: string,
  token: string
): Promise<{ assets: LiveDropAsset[]; maxBytes: number }> {
  return requestJson(baseUrl, '/live-drop', {
    headers: { Authorization: `Bearer ${token}` }
  }, 5000);
}

export async function uploadNodeLiveDrop(
  baseUrl: string,
  token: string,
  file: File,
  actorId: string
): Promise<LiveDropAsset> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5 * 60_000);

  try {
    const networkInit = {
      method: 'POST',
      cache: 'no-store',
      signal: controller.signal,
      targetAddressSpace: targetAddressSpaceFor(baseUrl),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': file.type || 'application/octet-stream',
        'x-live-file-name': encodeURIComponent(file.name),
        'x-live-actor-id': actorId
      },
      body: file
    } as RequestInit & { targetAddressSpace?: 'local' | 'loopback' };

    const response = await fetch(`${baseUrl}/live-drop`, networkInit);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new LiveNodeApiError(
        String(body?.error || 'live_drop_upload_failed'),
        response.status
      );
    }
    return body.asset as LiveDropAsset;
  } catch (error) {
    if (error instanceof LiveNodeApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new LiveNodeApiError('live_drop_upload_timeout', 0);
    }
    throw new LiveNodeApiError('live_drop_upload_unreachable', 0);
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function reviewNodeLiveDrop(
  baseUrl: string,
  token: string,
  assetId: string,
  status: 'ready' | 'rejected',
  reviewedBy: string
): Promise<LiveDropAsset> {
  const response = await requestJson<{ asset: LiveDropAsset }>(
    baseUrl,
    `/live-drop/${encodeURIComponent(assetId)}/review`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status, reviewedBy })
    },
    5000
  );
  return response.asset;
}

export async function openNodeLiveDrop(
  baseUrl: string,
  token: string,
  assetId: string,
  input: {
    actorId: string;
    liveSessionId: string;
    providerId?: string;
  }
): Promise<{
  asset: LiveDropAsset;
  correlationId: string;
  results: CommandResult[];
}> {
  return requestJson(
    baseUrl,
    `/live-drop/${encodeURIComponent(assetId)}/open`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(input)
    },
    15_000
  );
}


export async function submitNodeLiveRequest(
  baseUrl: string,
  token: string,
  request: LiveRequest
): Promise<{ request: LiveRequest; stateRevision: number }> {
  return requestJson(baseUrl, '/requests', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(request)
  }, 3500);
}

export async function updateNodeLiveRequestStatus(
  baseUrl: string,
  token: string,
  requestId: string,
  status: 'accepted' | 'rejected' | 'completed',
  resolvedBy: string
): Promise<{ request: LiveRequest; stateRevision: number }> {
  return requestJson(baseUrl, `/requests/${encodeURIComponent(requestId)}/status`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status, resolvedBy })
  }, 3500);
}


export async function cacheNodeScenes(
  baseUrl: string,
  token: string,
  scenes: Scene[]
): Promise<{ nodeId: string; scenes: number; stateRevision: number }> {
  return requestJson(baseUrl, '/scenes/cache', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ scenes })
  }, 5000);
}
