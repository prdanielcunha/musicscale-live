import { describe, expect, it, vi } from 'vitest';
import type { LiveCommand } from '@musicscale-live/domain';
import { FederatedProviderAdapter } from '../src/federatedProvider';
import type { PeerNodeRecord } from '../src/peerNodeStore';

const peer: PeerNodeRecord = {
  nodeId: 'node_led',
  baseUrl: 'http://192.168.1.44:4317',
  token: 'peer-token',
  displayName: 'PC LED',
  organizationId: 'org_1',
  venueId: 'venue_1',
  liveSystemId: 'system_1',
  pairedAt: '2026-09-19T12:00:00.000Z'
};

const command: LiveCommand = {
  id: 'cmd_1',
  correlationId: 'corr_1',
  organizationId: 'org_1',
  venueId: 'venue_1',
  liveSystemId: 'system_1',
  liveSessionId: 'session_1',
  actorId: 'operator_1',
  origin: 'live-ui',
  capability: 'visual.clip.trigger',
  targetProviderIds: ['peer:node_led:resolume-primary'],
  outputTargets: ['main'],
  payload: { clipId: 'clip_4' },
  idempotencyKey: 'idem_1',
  createdAt: '2026-09-19T12:00:00.000Z',
  safetyLevel: 'normal'
};

describe('FederatedProviderAdapter', () => {
  it('proxies a neutral command to the remote provider and preserves a namespaced result', async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}'));
      expect(body.targetProviderIds).toEqual(['resolume-primary']);
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        'Bearer peer-token'
      );

      return new Response(
        JSON.stringify({
          correlationId: 'corr_1',
          results: [{
            commandId: 'cmd_1',
            providerInstanceId: 'resolume-primary',
            accepted: true,
            observedState: { activeClip: 4 },
            latencyMs: 12
          }]
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }) as typeof fetch;

    const adapter = new FederatedProviderAdapter(
      peer,
      {
        providerId: 'resolume-primary',
        nodeId: 'node_led',
        displayName: 'Resolume Arena',
        providerKey: 'resolume',
        kind: 'visual',
        capabilities: ['visual.clip.trigger'],
        health: 'online',
        observed: {}
      },
      fetchImpl
    );

    const result = await adapter.execute(command);

    expect(result.accepted).toBe(true);
    expect(result.providerInstanceId).toBe('peer:node_led:resolume-primary');
    expect(adapter.descriptor.nodeId).toBe('node_led');
    expect(adapter.descriptor.displayName).toContain('PC LED');
  });

  it('marks the proxy offline when the peer cannot be reached', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network_down');
    }) as typeof fetch;

    const adapter = new FederatedProviderAdapter(
      peer,
      {
        providerId: 'resolume-primary',
        nodeId: 'node_led',
        displayName: 'Resolume Arena',
        providerKey: 'resolume',
        kind: 'visual',
        capabilities: ['visual.clip.trigger'],
        health: 'online',
        observed: {}
      },
      fetchImpl
    );

    const result = await adapter.execute(command);

    expect(result.accepted).toBe(false);
    expect(result.recoverable).toBe(true);
    expect(adapter.peekState().health).toBe('offline');
  });

  it('forwards guarded confirmation to the peer node', async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)['x-live-confirmation']).toBe('cmd_1');
      return new Response(
        JSON.stringify({
          correlationId: 'corr_1',
          results: [{
            commandId: 'cmd_1',
            providerInstanceId: 'resolume-primary',
            accepted: true,
            latencyMs: 5
          }]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    const adapter = new FederatedProviderAdapter(
      peer,
      {
        providerId: 'resolume-primary',
        nodeId: 'node_led',
        displayName: 'Resolume Arena',
        providerKey: 'resolume',
        kind: 'visual',
        capabilities: ['visual.clip.trigger'],
        health: 'online'
      },
      fetchImpl
    );

    await adapter.execute({ ...command, safetyLevel: 'guarded' });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
