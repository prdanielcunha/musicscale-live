import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

interface IdempotencyEntry<T> {
  value: T;
  expiresAt: number;
}

interface IdempotencyFile<T> {
  version: 1;
  entries: Array<{
    key: string;
    value: T;
    expiresAt: number;
  }>;
}

/**
 * Keeps command results stable across retries and, when a file path is supplied,
 * across Live Node restarts.
 *
 * `run()` also coalesces concurrent retries that carry the same idempotency key,
 * so a provider action is executed at most once inside a running Node process.
 */
export class IdempotencyStore<T> {
  private readonly values = new Map<string, IdempotencyEntry<T>>();
  private readonly inFlight = new Map<string, Promise<T>>();
  private loaded = false;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly ttlMs = 10 * 60 * 1000,
    private readonly maxEntries = 1000,
    private readonly filePath?: string
  ) {}

  async load(): Promise<void> {
    if (this.loaded) return;

    if (!this.filePath) {
      this.loaded = true;
      return;
    }

    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<IdempotencyFile<T>>;
      const now = Date.now();
      const entries = parsed.version === 1 && Array.isArray(parsed.entries)
        ? parsed.entries
        : [];

      for (const entry of entries) {
        if (
          entry &&
          typeof entry.key === 'string' &&
          Number.isFinite(entry.expiresAt) &&
          entry.expiresAt > now
        ) {
          this.values.set(entry.key, {
            value: entry.value,
            expiresAt: entry.expiresAt
          });
        }
      }

      this.trimToMaxEntries();
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error;
    }

    this.loaded = true;
  }

  get(key: string): T | undefined {
    if (this.filePath && !this.loaded) {
      throw new Error('idempotency_store_not_loaded');
    }

    const entry = this.values.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt <= Date.now()) {
      this.values.delete(key);
      return undefined;
    }

    return entry.value;
  }

  async set(key: string, value: T): Promise<void> {
    await this.load();
    this.sweep();

    if (!this.values.has(key) && this.values.size >= this.maxEntries) {
      const oldest = this.values.keys().next().value as string | undefined;
      if (oldest) this.values.delete(oldest);
    }

    this.values.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs
    });

    await this.queuePersist();
  }

  async run(key: string, producer: () => Promise<T>): Promise<T> {
    await this.load();

    const cached = this.get(key);
    if (cached !== undefined) return cached;

    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const task = (async () => {
      try {
        const value = await producer();
        await this.set(key, value);
        return value;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, task);
    return task;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.values) {
      if (entry.expiresAt <= now) this.values.delete(key);
    }
  }

  private trimToMaxEntries(): void {
    while (this.values.size > this.maxEntries) {
      const oldest = this.values.keys().next().value as string | undefined;
      if (!oldest) break;
      this.values.delete(oldest);
    }
  }

  private async queuePersist(): Promise<void> {
    if (!this.filePath) return;

    const operation = this.writeQueue
      .catch(() => undefined)
      .then(() => this.persist());

    this.writeQueue = operation.catch(() => undefined);
    await operation;
  }

  private async persist(): Promise<void> {
    if (!this.filePath) return;

    await mkdir(dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.tmp`;
    const payload: IdempotencyFile<T> = {
      version: 1,
      entries: [...this.values.entries()].map(([key, entry]) => ({
        key,
        value: entry.value,
        expiresAt: entry.expiresAt
      }))
    };

    await writeFile(temp, JSON.stringify(payload, null, 2), { mode: 0o600 });
    await rename(temp, this.filePath);
  }
}
