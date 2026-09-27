import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

async function seed() {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();

    await setDoc(doc(db, 'organizations', 'org-a'), {
      name: 'Org A',
      ownerUid: 'owner'
    });
    await setDoc(doc(db, 'organizations', 'org-b'), {
      name: 'Org B',
      ownerUid: 'other-owner'
    });

    await setDoc(doc(db, 'organizations/org-a/members', 'admin'), {
      uid: 'admin',
      status: 'active',
      organizationRole: 'admin'
    });
    await setDoc(doc(db, 'organizations/org-a/members', 'operator'), {
      uid: 'operator',
      status: 'active',
      organizationRole: 'member',
      permissions: {
        'musicscale.live.conduct': true
      }
    });
    await setDoc(doc(db, 'organizations/org-a/members', 'viewer'), {
      uid: 'viewer',
      status: 'active',
      organizationRole: 'member'
    });
    await setDoc(doc(db, 'organizations/org-b/members', 'other'), {
      uid: 'other',
      status: 'active',
      organizationRole: 'admin'
    });

    await setDoc(doc(db, 'musicScaleLiveVenues', 'venue-a'), {
      organizationId: 'org-a',
      name: 'Main sanctuary',
      timeZone: 'America/Sao_Paulo',
      active: true
    });
    await setDoc(doc(db, 'musicScaleLiveVenues', 'venue-b'), {
      organizationId: 'org-b',
      name: 'Other',
      timeZone: 'America/Sao_Paulo',
      active: true
    });
    await setDoc(doc(db, 'musicScaleLiveRequests', 'request-a'), {
      organizationId: 'org-a',
      venueId: 'venue-a',
      liveSessionId: 'session-a',
      actorId: 'viewer',
      kind: 'bible',
      payload: { reference: 'João 3:16' },
      status: 'sent',
      priority: 'normal',
      createdAt: '2026-09-19T00:00:00.000Z'
    });
  });
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-musicscale-live'
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed();
});

afterAll(async () => {
  await env.cleanup();
});

describe('MusicScale Live Firestore tenant rules', () => {
  it('lets an active tenant member read Live config but blocks cross-tenant reads', async () => {
    const viewer = env.authenticatedContext('viewer').firestore();

    await assertSucceeds(getDoc(doc(viewer, 'musicScaleLiveVenues', 'venue-a')));
    await assertFails(getDoc(doc(viewer, 'musicScaleLiveVenues', 'venue-b')));
  });

  it('allows admins to configure venues but blocks ordinary members', async () => {
    const admin = env.authenticatedContext('admin').firestore();
    const viewer = env.authenticatedContext('viewer').firestore();

    await assertSucceeds(setDoc(doc(admin, 'musicScaleLiveVenues', 'venue-new'), {
      organizationId: 'org-a',
      name: 'Youth room',
      timeZone: 'America/Sao_Paulo',
      active: true
    }));

    await assertFails(setDoc(doc(viewer, 'musicScaleLiveVenues', 'venue-denied'), {
      organizationId: 'org-a',
      name: 'Should fail',
      timeZone: 'America/Sao_Paulo',
      active: true
    }));
  });

  it('allows a Live conductor to cache a service plan without granting config authority', async () => {
    const operator = env.authenticatedContext('operator').firestore();

    await assertSucceeds(setDoc(doc(operator, 'musicScaleLiveServicePlans', 'plan-a'), {
      id: 'plan-a',
      organizationId: 'org-a',
      venueId: 'venue-a',
      liveSystemId: 'system-a',
      title: 'Sunday',
      scheduledAt: '2026-09-20T09:30:00-03:00',
      items: [],
      revision: 1
    }));

    await assertFails(setDoc(doc(operator, 'musicScaleLiveSystems', 'system-a'), {
      id: 'system-a',
      organizationId: 'org-a',
      venueId: 'venue-a',
      name: 'Main',
      activeProfileId: null
    }));
  });

  it('lets a member create only their own pending request', async () => {
    const viewer = env.authenticatedContext('viewer').firestore();

    await assertSucceeds(setDoc(doc(viewer, 'musicScaleLiveRequests', 'request-own'), {
      id: 'request-own',
      organizationId: 'org-a',
      venueId: 'venue-a',
      liveSessionId: 'session-a',
      actorId: 'viewer',
      kind: 'message',
      payload: { text: 'Voltar ao refrão' },
      status: 'sent',
      priority: 'normal',
      createdAt: '2026-09-19T00:00:00.000Z'
    }));

    await assertFails(setDoc(doc(viewer, 'musicScaleLiveRequests', 'request-spoof'), {
      id: 'request-spoof',
      organizationId: 'org-a',
      venueId: 'venue-a',
      liveSessionId: 'session-a',
      actorId: 'operator',
      kind: 'message',
      payload: { text: 'spoofed' },
      status: 'sent',
      createdAt: '2026-09-19T00:00:00.000Z'
    }));
  });

  it('lets the operator resolve a request while preventing the requester from self-approving it', async () => {
    const viewer = env.authenticatedContext('viewer').firestore();
    const operator = env.authenticatedContext('operator').firestore();

    await assertFails(updateDoc(doc(viewer, 'musicScaleLiveRequests', 'request-a'), {
      status: 'accepted'
    }));
    await assertSucceeds(updateDoc(doc(operator, 'musicScaleLiveRequests', 'request-a'), {
      status: 'accepted'
    }));
  });

  it('enforces the operator request lifecycle and blocks jumping straight to executed', async () => {
    const operator = env.authenticatedContext('operator').firestore();
    const ref = doc(operator, 'musicScaleLiveRequests', 'request-a');

    await assertFails(updateDoc(ref, { status: 'executed' }));
    await assertSucceeds(updateDoc(ref, {
      status: 'accepted',
      seenAt: '2026-09-24T12:00:01.000Z',
      acceptedAt: '2026-09-24T12:00:01.000Z'
    }));
    await assertFails(updateDoc(ref, { status: 'executed' }));
    await assertSucceeds(updateDoc(ref, {
      status: 'prepared',
      preparedAt: '2026-09-24T12:00:02.000Z'
    }));
    await assertSucceeds(updateDoc(ref, {
      status: 'executed',
      executedAt: '2026-09-24T12:00:03.000Z',
      resolvedAt: '2026-09-24T12:00:03.000Z'
    }));
  });

  it('lets the requester cancel sent or seen requests but never self-accept', async () => {
    const viewer = env.authenticatedContext('viewer').firestore();
    const ref = doc(viewer, 'musicScaleLiveRequests', 'request-a');

    await assertSucceeds(updateDoc(ref, {
      status: 'rejected',
      rejectedAt: '2026-09-24T12:00:01.000Z'
    }));
  });

  it('keeps tenant identity immutable on updates', async () => {
    const admin = env.authenticatedContext('admin').firestore();

    await assertFails(updateDoc(doc(admin, 'musicScaleLiveVenues', 'venue-a'), {
      organizationId: 'org-b'
    }));
  });

  it('blocks provider credentials from cloud documents while allowing safe provider links', async () => {
    const operator = env.authenticatedContext('operator').firestore();

    await assertSucceeds(setDoc(doc(operator, 'musicScaleLiveProviderLinks', 'link-safe'), {
      id: 'link-safe',
      organizationId: 'org-a',
      venueId: 'venue-a',
      providerInstanceId: 'holyrics-primary',
      entityType: 'song',
      musicScaleEntityId: 'song-a',
      externalId: 'holyrics-song-a'
    }));

    await assertFails(setDoc(doc(operator, 'musicScaleLiveProviderLinks', 'link-secret'), {
      id: 'link-secret',
      organizationId: 'org-a',
      venueId: 'venue-a',
      providerInstanceId: 'holyrics-primary',
      entityType: 'song',
      musicScaleEntityId: 'song-a',
      externalId: 'holyrics-song-a',
      token: 'must-never-reach-cloud'
    }));
  });

  it('allows members to publish only their own presence record', async () => {
    const viewer = env.authenticatedContext('viewer').firestore();

    await assertSucceeds(setDoc(doc(viewer, 'musicScaleLivePresence', 'viewer-presence'), {
      id: 'viewer-presence',
      organizationId: 'org-a',
      venueId: 'venue-a',
      liveSessionId: 'session-a',
      actorId: 'viewer',
      role: 'viewer',
      active: true,
      lastSeenAt: '2026-09-24T09:00:00.000Z'
    }));

    await assertFails(setDoc(doc(viewer, 'musicScaleLivePresence', 'spoofed-presence'), {
      id: 'spoofed-presence',
      organizationId: 'org-a',
      venueId: 'venue-a',
      liveSessionId: 'session-a',
      actorId: 'operator',
      role: 'operator',
      active: true,
      lastSeenAt: '2026-09-24T09:00:00.000Z'
    }));
  });

  it('keeps change history append-only and tenant-scoped', async () => {
    const operator = env.authenticatedContext('operator').firestore();

    await assertSucceeds(setDoc(doc(operator, 'musicScaleLiveChangeHistory', 'mutation-a'), {
      id: 'mutation-a',
      organizationId: 'org-a',
      venueId: 'venue-a',
      entityKind: 'scene',
      entityId: 'scene-a',
      operation: 'upsert',
      payload: { id: 'scene-a', name: 'Scene A' },
      version: 'v1',
      origin: 'studio',
      actorId: 'operator',
      createdAt: '2026-09-24T09:00:00.000Z',
      committedAt: '2026-09-24T09:00:01.000Z'
    }));

    await assertFails(updateDoc(doc(operator, 'musicScaleLiveChangeHistory', 'mutation-a'), {
      version: 'rewritten'
    }));
  });

  it('allows conductors to heartbeat fleet presence while keeping it tenant-scoped', async () => {
    const operator = env.authenticatedContext('operator').firestore();
    const other = env.authenticatedContext('other').firestore();

    await assertSucceeds(setDoc(doc(operator, 'musicScaleLiveFleetPresence', 'org-a-node-a'), {
      id: 'org-a-node-a',
      organizationId: 'org-a',
      venueId: 'venue-a',
      liveSystemId: 'system-a',
      nodeId: 'node-a',
      displayName: 'Produção principal',
      health: 'online',
      providers: 3,
      providersOnline: 3,
      lastSeenAt: '2026-09-26T12:00:00.000Z',
      updatedBy: 'operator'
    }));

    await assertFails(getDoc(doc(other, 'musicScaleLiveFleetPresence', 'org-a-node-a')));
  });

  it('allows conductors to sync tenant audio profiles without exposing another tenant', async () => {
    const operator = env.authenticatedContext('operator').firestore();
    const other = env.authenticatedContext('other').firestore();

    await assertSucceeds(setDoc(doc(operator, 'musicScaleLiveAudioProfiles', 'audio-a'), {
      id: 'audio-a',
      organizationId: 'org-a',
      venueId: 'venue-a',
      liveSystemId: 'system-a',
      name: 'Sunday audio',
      routes: [],
      createdAt: '2026-09-26T12:00:00.000Z',
      updatedAt: '2026-09-26T12:00:00.000Z'
    }));

    await assertFails(getDoc(doc(other, 'musicScaleLiveAudioProfiles', 'audio-a')));
  });

  it('keeps marketplace approval out of direct client writes', async () => {
    const operator = env.authenticatedContext('operator').firestore();

    await assertSucceeds(setDoc(doc(operator, 'musicScaleLiveTemplates', 'template-review'), {
      id: 'template-review',
      organizationId: 'org-a',
      name: 'Sunday template',
      kind: 'full-production',
      version: 1,
      payload: {},
      shared: false,
      marketplaceStatus: 'review',
      createdBy: 'operator',
      createdAt: '2026-09-26T12:00:00.000Z',
      updatedAt: '2026-09-26T12:00:00.000Z'
    }));

    await assertFails(setDoc(doc(operator, 'musicScaleLiveTemplates', 'template-approved'), {
      id: 'template-approved',
      organizationId: 'org-a',
      name: 'Bypass',
      kind: 'full-production',
      version: 1,
      payload: {},
      shared: true,
      marketplaceStatus: 'approved',
      createdBy: 'operator',
      createdAt: '2026-09-26T12:00:00.000Z',
      updatedAt: '2026-09-26T12:00:00.000Z'
    }));
  });

  it('keeps Live events append-only', async () => {
    const operator = env.authenticatedContext('operator').firestore();

    await assertSucceeds(setDoc(doc(operator, 'musicScaleLiveEvents', 'event-a'), {
      id: 'event-a',
      organizationId: 'org-a',
      venueId: 'venue-a',
      liveSystemId: 'system-a',
      liveSessionId: 'session-a',
      actorId: 'operator',
      type: 'take',
      occurredAt: '2026-09-19T00:00:00.000Z',
      source: 'live-ui',
      payload: { sceneId: 'scene-a' }
    }));

    await assertFails(updateDoc(doc(operator, 'musicScaleLiveEvents', 'event-a'), {
      type: 'rewritten'
    }));
  });
});
