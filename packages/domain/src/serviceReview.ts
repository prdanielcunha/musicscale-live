import type {
  LiveSessionEvent,
  ServiceItem,
  ServicePlan
} from './types';

const RUN_OF_SHOW_EVENT_TYPES = new Set([
  'song.presented',
  'bible.presented',
  'media.presented',
  'text.presented',
  'announcement.presented',
  'presentation.taken',
  'scene.executed'
]);

export type PlannedItemReviewStatus =
  | 'executed'
  | 'skipped'
  | 'not-observed';

export interface PlannedItemReview {
  serviceItemId: string;
  title: string;
  type: ServiceItem['type'];
  plannedState: ServiceItem['state'];
  status: PlannedItemReviewStatus;
  executionEvents: number;
  firstObservedAt?: string;
  lastObservedAt?: string;
}

export interface ActualRunOfShowEntry {
  eventId: string;
  type: string;
  occurredAt: string;
  correlationId: string;
  serviceItemId?: string;
  title?: string;
  origin?: LiveSessionEvent['origin'];
}

export interface ServiceReviewFailure {
  eventId: string;
  occurredAt: string;
  type: string;
  correlationId: string;
  serviceItemId?: string;
  providerIds: string[];
  errorCodes: string[];
}

export interface ServiceReviewRequestSummary {
  created: number;
  accepted: number;
  rejected: number;
  completed: number;
  latestStatusByRequest: Record<string, string>;
}

export interface ServiceReviewLatency {
  samples: number;
  p50Ms?: number;
  p95Ms?: number;
  maxMs?: number;
}

export interface ServiceReviewReport {
  planId: string;
  revision: number;
  generatedAt: string;
  liveSessionId?: string;
  plannedItems: number;
  executedPlannedItems: number;
  explicitlySkippedItems: number;
  notObservedItems: number;
  adHocRunOfShowActions: number;
  warningEvents: number;
  errorEvents: number;
  requestSummary: ServiceReviewRequestSummary;
  providerLatency: ServiceReviewLatency;
  items: PlannedItemReview[];
  adHoc: ActualRunOfShowEntry[];
  failures: ServiceReviewFailure[];
  originCounts: Record<string, number>;
  eventTypeCounts: Record<string, number>;
  factsOnly: true;
}

function eventPayload(event: LiveSessionEvent): Record<string, unknown> {
  return event.payload && typeof event.payload === 'object'
    ? event.payload as Record<string, unknown>
    : {};
}

function compactTitle(event: LiveSessionEvent): string | undefined {
  const payload = eventPayload(event);
  const subject =
    payload.subject && typeof payload.subject === 'object'
      ? payload.subject as Record<string, unknown>
      : {};
  for (const key of ['title', 'name', 'reference', 'text']) {
    const value = subject[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim().slice(0, 160);
    }
  }
  return undefined;
}

function percentile(values: number[], quantile: number): number | undefined {
  if (!values.length) return undefined;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(quantile * sorted.length) - 1)
  );
  return sorted[index];
}

function providerFacts(event: LiveSessionEvent): Array<{
  providerId: string;
  accepted: boolean;
  latencyMs?: number;
  errorCode?: string;
}> {
  const payload = eventPayload(event);
  const providers = Array.isArray(payload.providers) ? payload.providers : [];
  return providers.flatMap(value => {
    if (!value || typeof value !== 'object') return [];
    const item = value as Record<string, unknown>;
    if (typeof item.providerId !== 'string' || typeof item.accepted !== 'boolean') {
      return [];
    }
    return [{
      providerId: item.providerId,
      accepted: item.accepted,
      latencyMs:
        typeof item.latencyMs === 'number' && Number.isFinite(item.latencyMs)
          ? Math.max(0, item.latencyMs)
          : undefined,
      errorCode:
        typeof item.errorCode === 'string' && item.errorCode.trim()
          ? item.errorCode.trim()
          : undefined
    }];
  });
}

function reviewRequests(events: LiveSessionEvent[]): ServiceReviewRequestSummary {
  const latestStatusByRequest: Record<string, string> = {};
  let created = 0;

  const chronological = events
    .filter(event =>
      event.type === 'request.created' ||
      event.type === 'request.status.changed'
    )
    .slice()
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  for (const event of chronological) {
    const payload = eventPayload(event);
    const requestId =
      typeof payload.requestId === 'string' ? payload.requestId : event.correlationId;
    const status = typeof payload.status === 'string' ? payload.status : '';
    if (event.type === 'request.created') created += 1;
    if (requestId && status) latestStatusByRequest[requestId] = status;
  }

  const statuses = Object.values(latestStatusByRequest);
  return {
    created,
    accepted: statuses.filter(status => status === 'accepted').length,
    rejected: statuses.filter(status => status === 'rejected').length,
    completed: statuses.filter(status => status === 'completed').length,
    latestStatusByRequest
  };
}

export function buildServiceReview(input: {
  plan: ServicePlan;
  events: LiveSessionEvent[];
  liveSessionId?: string;
  now?: Date;
}): ServiceReviewReport {
  const scopedEvents = input.events
    .filter(event => !input.liveSessionId || event.liveSessionId === input.liveSessionId)
    .slice()
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  const byItem = new Map<string, LiveSessionEvent[]>();
  const adHoc: ActualRunOfShowEntry[] = [];
  const failures: ServiceReviewFailure[] = [];
  const eventTypeCounts: Record<string, number> = {};
  const originCounts: Record<string, number> = {};
  const latencies: number[] = [];

  for (const event of scopedEvents) {
    eventTypeCounts[event.type] = (eventTypeCounts[event.type] || 0) + 1;
    if (event.origin) {
      originCounts[event.origin] = (originCounts[event.origin] || 0) + 1;
    }

    if (event.serviceItemId) {
      const existing = byItem.get(event.serviceItemId) || [];
      existing.push(event);
      byItem.set(event.serviceItemId, existing);
    }

    const payload = eventPayload(event);
    if (
      RUN_OF_SHOW_EVENT_TYPES.has(event.type) &&
      (payload.adHoc === true || !event.serviceItemId) &&
      event.level !== 'error'
    ) {
      adHoc.push({
        eventId: event.id,
        type: event.type,
        occurredAt: event.occurredAt,
        correlationId: event.correlationId,
        serviceItemId: event.serviceItemId,
        title: compactTitle(event),
        origin: event.origin
      });
    }

    const providerResults = providerFacts(event);
    for (const result of providerResults) {
      if (typeof result.latencyMs === 'number') latencies.push(result.latencyMs);
    }

    if (event.level === 'error' || providerResults.some(result => !result.accepted)) {
      failures.push({
        eventId: event.id,
        occurredAt: event.occurredAt,
        type: event.type,
        correlationId: event.correlationId,
        serviceItemId: event.serviceItemId,
        providerIds: providerResults
          .filter(result => !result.accepted)
          .map(result => result.providerId),
        errorCodes: providerResults
          .filter(result => !result.accepted && result.errorCode)
          .map(result => result.errorCode!)
      });
    }
  }

  const items: PlannedItemReview[] = input.plan.items.map(item => {
    const itemEvents = (byItem.get(item.id) || [])
      .filter(event =>
        RUN_OF_SHOW_EVENT_TYPES.has(event.type) &&
        event.level !== 'error'
      );
    const status: PlannedItemReviewStatus =
      item.state === 'skipped'
        ? 'skipped'
        : itemEvents.length
          ? 'executed'
          : 'not-observed';

    return {
      serviceItemId: item.id,
      title: item.title,
      type: item.type,
      plannedState: item.state,
      status,
      executionEvents: itemEvents.length,
      firstObservedAt: itemEvents[0]?.occurredAt,
      lastObservedAt: itemEvents[itemEvents.length - 1]?.occurredAt
    };
  });

  return {
    planId: input.plan.id,
    revision: input.plan.revision,
    generatedAt: (input.now || new Date()).toISOString(),
    liveSessionId: input.liveSessionId,
    plannedItems: items.length,
    executedPlannedItems: items.filter(item => item.status === 'executed').length,
    explicitlySkippedItems: items.filter(item => item.status === 'skipped').length,
    notObservedItems: items.filter(item => item.status === 'not-observed').length,
    adHocRunOfShowActions: adHoc.length,
    warningEvents: scopedEvents.filter(event => event.level === 'warning').length,
    errorEvents: scopedEvents.filter(event => event.level === 'error').length,
    requestSummary: reviewRequests(scopedEvents),
    providerLatency: {
      samples: latencies.length,
      p50Ms: percentile(latencies, 0.5),
      p95Ms: percentile(latencies, 0.95),
      maxMs: latencies.length ? Math.max(...latencies) : undefined
    },
    items,
    adHoc,
    failures,
    originCounts,
    eventTypeCounts,
    factsOnly: true
  };
}
