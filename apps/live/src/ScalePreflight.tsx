import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { matchExternalSong, type SongIdentity } from '@millionsnest/live-domain';
import type { SharedScale } from './musicScaleBridge';
import { buildServicePlan, type PreparedSongLink } from './servicePlanBuilder';
import { liveFeatureFlags } from './featureFlags';
import { syncPreparedServicePlan } from './liveCloudRepository';
import type { useLiveNode } from './useLiveNode';

type Controller = ReturnType<typeof useLiveNode>;

interface ExternalSong extends SongIdentity {
  key?: string;
  bpm?: number;
}

type RowStatus =
  | 'idle'
  | 'checking'
  | 'matched'
  | 'ambiguous'
  | 'missing'
  | 'creating'
  | 'error';

interface PreflightRow {
  source: SharedScale['songs'][number];
  status: RowStatus;
  matched?: ExternalSong;
  candidates: ExternalSong[];
  error?: string;
}

function extractExternalSongs(
  results: Awaited<ReturnType<Controller['executeCommand']>>
): ExternalSong[] {
  return results
    .flatMap(result => {
      const value = result.observedState?.results;
      return Array.isArray(value) ? value : [];
    })
    .filter(value => value && typeof value === 'object')
    .map(value => {
      const item = value as Record<string, unknown>;
      return {
        id: String(item.id || ''),
        title: String(item.title || ''),
        artist: item.artist ? String(item.artist) : undefined,
        key: item.key ? String(item.key) : undefined,
        bpm: typeof item.bpm === 'number' ? item.bpm : undefined
      };
    })
    .filter(item => item.id && item.title);
}

async function resolveSong(
  controller: Controller,
  providerId: string,
  source: SharedScale['songs'][number],
  actorId: string,
  scaleId: string
): Promise<PreflightRow> {
  try {
    const results = await controller.executeCommand({
      capability: 'songs.search',
      payload: {
        text: source.title,
        title: true,
        artist: true,
        fields: 'id,title,artist,key,bpm'
      },
      liveSessionId: `preflight:${scaleId}`,
      actorId,
      targetProviderIds: [providerId]
    });

    const externalSongs = extractExternalSongs(results);
    const decision = matchExternalSong(
      { title: source.title, artist: source.artist },
      externalSongs
    );

    if (decision.status === 'matched') {
      return {
        source,
        status: 'matched',
        matched: decision.candidate,
        candidates: externalSongs
      };
    }

    if (decision.status === 'ambiguous') {
      return {
        source,
        status: 'ambiguous',
        candidates: decision.candidates
      };
    }

    return {
      source,
      status: 'missing',
      candidates: externalSongs
    };
  } catch (error) {
    return {
      source,
      status: 'error',
      candidates: [],
      error: error instanceof Error ? error.message : 'preflight_failed'
    };
  }
}

function toPreparedLinks(
  rows: PreflightRow[],
  providerId: string
): PreparedSongLink[] {
  return rows
    .filter((row): row is PreflightRow & { matched: ExternalSong } =>
      row.status === 'matched' && Boolean(row.matched)
    )
    .map(row => ({
      musicScaleSongId: row.source.id,
      providerInstanceId: providerId,
      externalId: row.matched.id,
      fingerprint: `${row.matched.title}|${row.matched.artist || ''}`
    }));
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

export function ScalePreflight({
  controller,
  scale,
  actorId
}: {
  controller: Controller;
  scale: SharedScale;
  actorId: string;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<PreflightRow[]>(
    scale.songs.map(source => ({ source, status: 'idle', candidates: [] }))
  );
  const rowsRef = useRef(rows);
  const [running, setRunning] = useState(false);
  const [creatingSongId, setCreatingSongId] = useState<string | null>(null);
  const [syncArmed, setSyncArmed] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [offlinePrepared, setOfflinePrepared] = useState(false);
  const [cloudSync, setCloudSync] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const syncTimer = useRef<number | null>(null);
  const cachedSignature = useRef<string | null>(null);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const scaleSignature = useMemo(
    () => `${scale.id}:${scale.publishRevision || 1}:${scale.songIds.join('|')}`,
    [scale.id, scale.publishRevision, scale.songIds]
  );

  useEffect(() => {
    setRows(current => {
      const byId = new Map(current.map(row => [row.source.id, row]));
      const next = scale.songs.map(source => {
        const existing = byId.get(source.id);
        return existing
          ? { ...existing, source }
          : { source, status: 'idle' as const, candidates: [] };
      });
      rowsRef.current = next;
      return next;
    });
    cachedSignature.current = null;
    setOfflinePrepared(false);
    setSyncArmed(false);
    setSyncMessage(null);
  }, [scaleSignature, scale.songs]);

  const capabilities = useMemo(
    () => new Set(
      (controller.nodeState?.providers || [])
        .filter(provider => provider.health === 'online' || provider.health === 'degraded')
        .flatMap(provider => provider.capabilities)
    ),
    [controller.nodeState]
  );

  const provider = useMemo(() => {
    const candidates = (controller.nodeState?.providers || []).filter(candidate =>
      (candidate.health === 'online' || candidate.health === 'degraded') &&
      candidate.capabilities.includes('songs.search')
    );
    const routedProviderId = controller.nodeState?.routing?.songs;
    if (routedProviderId) {
      return candidates.find(candidate => candidate.providerId === routedProviderId) || null;
    }
    return candidates.length === 1 ? candidates[0]! : null;
  }, [controller.nodeState]);

  const readyCount = rows.filter(row => row.status === 'matched' && row.matched).length;
  const unresolvedCount = rows.length - readyCount;
  const canSearch = Boolean(provider) && capabilities.has('songs.search');
  const canSync = Boolean(provider) && provider?.capabilities.includes('playlist.sync') === true;
  const canCreate = Boolean(provider) && provider?.capabilities.includes('songs.create') === true;
  const busy = running || Boolean(creatingSongId);

  async function persistPrepared(targetRows: PreflightRow[]) {
    if (!provider || !controller.credential) return;
    const prepared = toPreparedLinks(targetRows, provider.providerId);
    const { plan, providerLinks } = buildServicePlan(
      scale,
      {
        venueId: controller.credential.binding.venueId,
        liveSystemId: controller.credential.binding.liveSystemId
      },
      prepared
    );

    await controller.cacheServicePlan(plan, providerLinks);
    setOfflinePrepared(true);
    if (liveFeatureFlags.servicePlanWrites) {
      setCloudSync('syncing');
      try {
        await syncPreparedServicePlan(plan, providerLinks, actorId);
        setCloudSync('synced');
      } catch {
        setCloudSync('error');
      }
    }
  }

  useEffect(() => {
    if (
      running ||
      creatingSongId ||
      !provider ||
      !controller.credential ||
      rows.length === 0 ||
      unresolvedCount > 0
    ) {
      if (unresolvedCount > 0) setOfflinePrepared(false);
      return;
    }

    const prepared = toPreparedLinks(rows, provider.providerId);
    const signature = prepared
      .map(link => `${link.musicScaleSongId}:${link.externalId}`)
      .join('|');

    if (!signature || cachedSignature.current === signature) return;
    cachedSignature.current = signature;

    void persistPrepared(rows).catch(() => {
      cachedSignature.current = null;
      setOfflinePrepared(false);
    });
  }, [
    controller.credential,
    creatingSongId,
    provider,
    rows,
    running,
    scaleSignature,
    unresolvedCount
  ]);

  async function runPreflight() {
    if (!provider || !canSearch || busy) return;
    setRunning(true);
    setSyncMessage(null);

    const nextRows: PreflightRow[] = [];
    for (const source of scale.songs) {
      setRows(current => current.map(row =>
        row.source.id === source.id
          ? { ...row, status: 'checking', error: undefined }
          : row
      ));

      const resolved = await resolveSong(
        controller,
        provider.providerId,
        source,
        actorId,
        scale.id
      );
      nextRows.push(resolved);
      setRows(current => current.map(row =>
        row.source.id === resolved.source.id ? resolved : row
      ));
    }

    rowsRef.current = nextRows;
    setRows(nextRows);
    setRunning(false);
  }

  function chooseCandidate(sourceId: string, externalId: string) {
    setRows(current => {
      const next = current.map(row => {
        if (row.source.id !== sourceId) return row;
        const matched = row.candidates.find(candidate => candidate.id === externalId);
        return matched
          ? { ...row, status: 'matched' as const, matched }
          : { ...row, status: 'ambiguous' as const, matched: undefined };
      });
      rowsRef.current = next;
      return next;
    });
  }

  async function performPlaylistSync(
    targetRows: PreflightRow[],
    successMessage = t('preflight.syncDoneOffline')
  ) {
    if (!provider || !canSync) return false;
    const ids = targetRows
      .map(row => row.matched?.id)
      .filter((id): id is string => Boolean(id));
    if (ids.length !== targetRows.length || ids.length === 0) return false;

    const result = await controller.executeCommand({
      capability: 'playlist.sync',
      payload: { ids },
      liveSessionId: `music-scale:${scale.id}`,
      actorId,
      targetProviderIds: [provider.providerId],
      safetyLevel: 'guarded',
      confirmed: true
    });
    const failed = result.find(item => !item.accepted);

    if (failed) {
      setSyncMessage(t('preflight.syncFailed', {
        code: failed.errorCode || 'provider_error'
      }));
      return false;
    }

    await persistPrepared(targetRows);
    setSyncMessage(successMessage);
    return true;
  }

  async function syncPlaylist() {
    if (!canSync || unresolvedCount > 0 || busy) return;

    if (!syncArmed) {
      setSyncArmed(true);
      setSyncMessage(t('preflight.replaceWarning'));
      if (syncTimer.current) window.clearTimeout(syncTimer.current);
      syncTimer.current = window.setTimeout(() => {
        setSyncArmed(false);
        setSyncMessage(null);
      }, 5000);
      return;
    }

    setSyncArmed(false);
    setRunning(true);
    setSyncMessage(null);
    try {
      await performPlaylistSync(rows);
    } catch (error) {
      setSyncMessage(t('preflight.syncFailed', {
        code: error instanceof Error ? error.message : 'unknown'
      }));
    } finally {
      setRunning(false);
    }
  }

  async function createMissingSong(source: SharedScale['songs'][number]) {
    if (!provider || !canCreate || busy) return;
    const lyrics = String(source.lyrics || '').trim();
    if (!lyrics) {
      setSyncMessage(t('preflight.createNeedsLyrics', { title: source.title }));
      return;
    }

    setCreatingSongId(source.id);
    setSyncMessage(null);
    setRows(current => {
      const next = current.map(row =>
        row.source.id === source.id
          ? { ...row, status: 'creating' as const, error: undefined }
          : row
      );
      rowsRef.current = next;
      return next;
    });

    try {
      const creation = await controller.executeCommand({
        capability: 'songs.create',
        payload: {
          title: source.title,
          artist: source.artist || undefined,
          lyrics,
          key: source.selectedKey || source.key || undefined,
          bpm: source.selectedBpm ?? source.bpm ?? undefined,
          note: 'MusicScale Live'
        },
        liveSessionId: `preflight:${scale.id}`,
        actorId,
        targetProviderIds: [provider.providerId],
        safetyLevel: 'guarded',
        confirmed: true
      });

      const failed = creation.find(result => !result.accepted);
      if (failed) {
        throw new Error(failed.errorCode || 'song_create_failed');
      }

      const providerNeedsSave = creation.some(result =>
        result.observedState?.requiresProviderSave === true
      );
      setSyncMessage(providerNeedsSave
        ? t('preflight.createOpened', { title: source.title })
        : t('preflight.createRequested', { title: source.title })
      );

      let matchedRow: PreflightRow | null = null;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await wait(1500);
        const resolved = await resolveSong(
          controller,
          provider.providerId,
          source,
          actorId,
          scale.id
        );
        if (resolved.status === 'matched' && resolved.matched) {
          matchedRow = resolved;
          break;
        }
      }

      if (!matchedRow) {
        setRows(current => {
          const next = current.map(row =>
            row.source.id === source.id
              ? { ...row, status: 'missing' as const }
              : row
          );
          rowsRef.current = next;
          return next;
        });
        setSyncMessage(t('preflight.createWaiting', { title: source.title }));
        return;
      }

      const nextRows = rowsRef.current.map(row =>
        row.source.id === source.id ? matchedRow! : row
      );
      rowsRef.current = nextRows;
      setRows(nextRows);
      setSyncMessage(t('preflight.createDetected', { title: source.title }));

      if (
        canSync &&
        nextRows.length > 0 &&
        nextRows.every(row => row.status === 'matched' && row.matched)
      ) {
        await performPlaylistSync(
          nextRows,
          t('preflight.createAndSyncDone', { title: source.title })
        );
      }
    } catch (error) {
      setRows(current => {
        const next = current.map(row =>
          row.source.id === source.id
            ? {
                ...row,
                status: 'error' as const,
                error: error instanceof Error ? error.message : 'song_create_failed'
              }
            : row
        );
        rowsRef.current = next;
        return next;
      });
      setSyncMessage(t('preflight.createFailed', {
        title: source.title,
        code: error instanceof Error ? error.message : 'song_create_failed'
      }));
    } finally {
      setCreatingSongId(null);
    }
  }

  return (
    <section className="preflight-panel">
      <div className="preflight-header">
        <div>
          <span className="eyebrow">{t('preflight.kicker')}</span>
          <h2>{t('preflight.title')}</h2>
          <p>{scale.eventName || t('nextService')} · {scale.date}{scale.time ? ` · ${scale.time}` : ''}</p>
        </div>
        <div className="preflight-score">
          <strong>{readyCount}/{rows.length}</strong>
          <small>{t('preflight.ready')}</small>
          {offlinePrepared && <em>{t('preflight.offlineReady')}</em>}
          {liveFeatureFlags.servicePlanWrites && cloudSync !== 'idle' && (
            <em className={`cloud-sync-${cloudSync}`}>
              {t(`preflight.cloudSync.${cloudSync}`)}
            </em>
          )}
        </div>
      </div>

      <div className="preflight-actions">
        <button
          className="secondary"
          disabled={!canSearch || busy || !rows.length}
          onClick={() => void runPreflight()}
        >
          {running ? t('preflight.checking') : t('preflight.check')}
        </button>
        <button
          className={syncArmed ? 'primary danger-confirm' : 'primary'}
          disabled={!canSync || unresolvedCount > 0 || busy || !rows.length}
          onClick={() => void syncPlaylist()}
        >
          {syncArmed ? t('preflight.confirmReplace') : t('preflight.sync')}
        </button>
      </div>

      <div className="preflight-list">
        {rows.map((row, index) => (
          <div className="preflight-row" key={row.source.id}>
            <b>{String(index + 1).padStart(2, '0')}</b>
            <div className="preflight-song">
              <strong>{row.source.title}</strong>
              <small>{row.source.artist || ''}</small>
            </div>
            <div className={`preflight-state state-${row.status}`}>
              {row.status === 'idle' && t('preflight.idle')}
              {row.status === 'checking' && t('preflight.checking')}
              {row.status === 'creating' && t('preflight.creating')}
              {row.status === 'matched' && row.matched && (
                <span title={row.matched.id}>
                  {t('preflight.matched')} · {row.matched.title}
                </span>
              )}
              {row.status === 'missing' && (
                <div className="preflight-missing-actions">
                  <span>{t('preflight.missing')}</span>
                  {canCreate && (
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy || !row.source.lyrics?.trim()}
                      title={!row.source.lyrics?.trim()
                        ? t('preflight.createNeedsLyrics', { title: row.source.title })
                        : undefined}
                      onClick={() => void createMissingSong(row.source)}
                    >
                      {t('preflight.createSong')}
                    </button>
                  )}
                </div>
              )}
              {row.status === 'error' && (
                <span title={row.error}>{t('preflight.error')}</span>
              )}
              {row.status === 'ambiguous' && (
                <select
                  value=""
                  onChange={event => chooseCandidate(row.source.id, event.target.value)}
                  aria-label={t('preflight.choose')}
                >
                  <option value="">{t('preflight.choose')}</option>
                  {row.candidates.map(candidate => (
                    <option value={candidate.id} key={candidate.id}>
                      {candidate.title}{candidate.artist ? ` — ${candidate.artist}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        ))}
      </div>

      {!canSearch && <p className="preflight-note">{t('preflight.searchUnavailable')}</p>}
      {canSearch && !canSync && <p className="preflight-note">{t('preflight.syncUnavailable')}</p>}
      {canSearch && !canCreate && (
        <p className="preflight-note">{t('preflight.createUnavailable')}</p>
      )}
      {syncMessage && <p className="preflight-message">{syncMessage}</p>}
    </section>
  );
}
