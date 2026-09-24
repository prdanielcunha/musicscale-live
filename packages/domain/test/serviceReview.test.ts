import { describe, expect, it } from 'vitest';
import type { LiveSessionEvent, ServicePlan } from '../src/types';
import { buildServiceReview } from '../src/serviceReview';

const plan: ServicePlan = {
  id: 'plan-1',
  organizationId: 'org-1',
  venueId: 'venue-1',
  liveSystemId: 'system-1',
  title: 'Sunday',
  scheduledAt: '2026-09-27T19:00:00-03:00',
  revision: 2,
  items: [
    { id: 'song-1', type: 'song', title: 'Song A', state: 'prepared' },
    { id: 'bible-1', type: 'bible', title: 'John 3:16', state: 'prepared' },
    { id: 'song-2', type: 'song', title: 'Song B', state: 'skipped' }
  ]
};

function event(input: Partial<LiveSessionEvent> & Pick<LiveSessionEvent, 'id' | 'type'>): LiveSessionEvent {
  return {
    id: input.id,
    correlationId: input.correlationId || input.id,
    type: input.type,
    occurredAt: input.occurredAt || '2026-09-27T22:00:00.000Z',
    source: 'live-node',
    organizationId: 'org-1',
    venueId: 'venue-1',
    liveSystemId: 'system-1',
    liveSessionId: input.liveSessionId || 'session-1',
    actorId: input.actorId,
    serviceItemId: input.serviceItemId,
    origin: input.origin,
    level: input.level || 'info',
    payload: input.payload || {}
  };
}

describe('buildServiceReview', () => {
  it('compares planned and actual facts without calling an unobserved item skipped', () => {
    const report = buildServiceReview({
      plan,
      liveSessionId: 'session-1',
      now: new Date('2026-09-27T23:00:00.000Z'),
      events: [
        event({
          id: 'e-song',
          type: 'song.presented',
          serviceItemId: 'song-1',
          payload: {
            planned: true,
            adHoc: false,
            providers: [{
              providerId: 'holyrics-primary',
              accepted: true,
              latencyMs: 90
            }]
          }
        }),
        event({
          id: 'e-adhoc',
          type: 'bible.presented',
          payload: {
            planned: false,
            adHoc: true,
            subject: { reference: 'Psalm 23' },
            providers: [{
              providerId: 'holyrics-primary',
              accepted: true,
              latencyMs: 120
            }]
          }
        })
      ]
    });

    expect(report.executedPlannedItems).toBe(1);
    expect(report.explicitlySkippedItems).toBe(1);
    expect(report.notObservedItems).toBe(1);
    expect(report.items.find(item => item.serviceItemId === 'bible-1')?.status)
      .toBe('not-observed');
    expect(report.adHocRunOfShowActions).toBe(1);
    expect(report.adHoc[0]?.title).toBe('Psalm 23');
    expect(report.factsOnly).toBe(true);
  });

  it('records provider failures and latency from the immutable event payload', () => {
    const report = buildServiceReview({
      plan,
      liveSessionId: 'session-1',
      events: [
        event({
          id: 'e-fail',
          type: 'command.failed',
          serviceItemId: 'song-1',
          level: 'error',
          payload: {
            providers: [{
              providerId: 'holyrics-primary',
              accepted: false,
              latencyMs: 310,
              errorCode: 'provider_timeout'
            }]
          }
        }),
        event({
          id: 'e-ok',
          type: 'song.presented',
          serviceItemId: 'song-1',
          payload: {
            providers: [{
              providerId: 'holyrics-primary',
              accepted: true,
              latencyMs: 100
            }]
          }
        })
      ]
    });

    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]?.providerIds).toEqual(['holyrics-primary']);
    expect(report.failures[0]?.errorCodes).toEqual(['provider_timeout']);
    expect(report.providerLatency.samples).toBe(2);
    expect(report.providerLatency.maxMs).toBe(310);
  });

  it('tracks request terminal state using the latest factual status event', () => {
    const report = buildServiceReview({
      plan,
      liveSessionId: 'session-1',
      events: [
        event({
          id: 'request-created',
          type: 'request.created',
          correlationId: 'request-1',
          payload: { requestId: 'request-1', status: 'pending' }
        }),
        event({
          id: 'request-accepted',
          type: 'request.status.changed',
          correlationId: 'request-1',
          occurredAt: '2026-09-27T22:01:00.000Z',
          payload: { requestId: 'request-1', status: 'accepted' }
        }),
        event({
          id: 'request-completed',
          type: 'request.status.changed',
          correlationId: 'request-1',
          occurredAt: '2026-09-27T22:02:00.000Z',
          payload: { requestId: 'request-1', status: 'completed' }
        })
      ]
    });

    expect(report.requestSummary.created).toBe(1);
    expect(report.requestSummary.completed).toBe(1);
    expect(report.requestSummary.accepted).toBe(0);
    expect(report.requestSummary.latestStatusByRequest['request-1']).toBe('completed');
  });

  it('ignores events from another session when a session is selected', () => {
    const report = buildServiceReview({
      plan,
      liveSessionId: 'session-1',
      events: [
        event({ id: 'correct', type: 'song.presented', serviceItemId: 'song-1' }),
        event({
          id: 'other',
          type: 'bible.presented',
          liveSessionId: 'session-2',
          payload: { adHoc: true }
        })
      ]
    });

    expect(report.adHocRunOfShowActions).toBe(0);
    expect(report.executedPlannedItems).toBe(1);
  });
});
