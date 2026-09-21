import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type {
  LiveSessionEvent,
  LiveSessionEventSummary
} from '@millionsnest/live-domain';

export interface LiveEventQuery {
  organizationId: string;
  venueId: string;
  liveSystemId: string;
  liveSessionId?: string;
  limit?: number;
}

export class LiveEventLogStore {
  private loaded = false;
  private events: LiveSessionEvent[] = [];
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly maxEntries = 5000
  ) {}

  async append(event: LiveSessionEvent): Promise<void> {
    let rejectResult!: (error: unknown) => void;
    const result = new Promise<void>((resolve, reject) => {
      rejectResult = reject;
      this.writeQueue = this.writeQueue
        .then(async () => {
          await this.load();
          if (!this.events.some(item => item.id === event.id)) {
            this.events.push(structuredClone(event));
            if (this.events.length > this.maxEntries) {
              this.events = this.events.slice(-this.maxEntries);
            }
            await this.persist();
          }
          resolve();
        })
        .catch(error => {
          rejectResult(error);
        });
    });
    return result;
  }

  async list(query: LiveEventQuery): Promise<LiveSessionEvent[]> {
    await this.load();
    const limit = Math.max(1, Math.min(250, Math.floor(query.limit || 80)));
    return this.events
      .filter(event =>
        event.organizationId === query.organizationId &&
        event.venueId === query.venueId &&
        event.liveSystemId === query.liveSystemId &&
        (!query.liveSessionId || event.liveSessionId === query.liveSessionId)
      )
      .slice()
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, limit)
      .map(event => structuredClone(event));
  }

  async count(query: Omit<LiveEventQuery, 'limit'>): Promise<number> {
    await this.load();
    return this.matching(query).length;
  }

  async summarize(
    query: Omit<LiveEventQuery, 'limit'>
  ): Promise<LiveSessionEventSummary> {
    await this.load();
    const matched = this.matching(query);
    const plannedItems = new Set<string>();
    const byType: Record<string, number> = {};
    let info = 0;
    let warnings = 0;
    let errors = 0;
    let plannedActions = 0;
    let adHocActions = 0;

    for (const event of matched) {
      byType[event.type] = (byType[event.type] || 0) + 1;
      if (event.level === 'error') errors += 1;
      else if (event.level === 'warning') warnings += 1;
      else info += 1;

      if (event.serviceItemId && event.level !== 'error') {
        plannedItems.add(event.serviceItemId);
        plannedActions += 1;
      }

      const payload = event.payload && typeof event.payload === 'object'
        ? event.payload as Record<string, unknown>
        : {};
      if (payload.adHoc === true && event.level !== 'error') adHocActions += 1;
    }

    const chronological = matched
      .slice()
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

    return {
      total: matched.length,
      info,
      warnings,
      errors,
      plannedActions,
      plannedServiceItems: plannedItems.size,
      adHocActions,
      byType,
      startedAt: chronological[0]?.occurredAt,
      lastEventAt: chronological[chronological.length - 1]?.occurredAt
    };
  }

  private matching(
    query: Omit<LiveEventQuery, 'limit'>
  ): LiveSessionEvent[] {
    return this.events.filter(event =>
      event.organizationId === query.organizationId &&
      event.venueId === query.venueId &&
      event.liveSystemId === query.liveSystemId &&
      (!query.liveSessionId || event.liveSessionId === query.liveSessionId)
    );
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      this.events = Array.isArray(parsed)
        ? parsed.filter(item =>
            item &&
            typeof item === 'object' &&
            typeof item.id === 'string' &&
            typeof item.liveSessionId === 'string' &&
            typeof item.occurredAt === 'string'
          ) as LiveSessionEvent[]
        : [];
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error;
      this.events = [];
    }
    if (this.events.length > this.maxEntries) {
      this.events = this.events.slice(-this.maxEntries);
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.tmp`;
    await writeFile(temp, JSON.stringify(this.events, null, 2), { mode: 0o600 });
    await rename(temp, this.filePath);
  }
}
