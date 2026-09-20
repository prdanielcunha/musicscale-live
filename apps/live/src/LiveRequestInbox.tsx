import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CommandResult, LiveRequest } from '@millionsnest/live-domain';
import type { useLiveNode } from './useLiveNode';

type Controller = ReturnType<typeof useLiveNode>;

interface PreparedBibleRequest {
  reference: string;
  ids: string[];
  verseCount: number;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(String).map(item => item.trim()).filter(Boolean)
    : [];
}

function firstCommandFailure(results: CommandResult[]): CommandResult | null {
  return results.find(result => !result.accepted) || null;
}

function preparedBibleFromResults(
  results: CommandResult[],
  fallbackReference: string
): PreparedBibleRequest {
  for (const result of results) {
    const rawMatches = result.observedState?.matches;
    const matches = Array.isArray(rawMatches)
      ? rawMatches
      : rawMatches
        ? [rawMatches]
        : [];

    for (const candidate of matches) {
      if (!candidate || typeof candidate !== 'object') continue;
      const match = candidate as Record<string, unknown>;
      const ids = Array.isArray(match.ids)
        ? match.ids.map(String).filter(Boolean)
        : match.id
          ? [String(match.id)]
          : [];
      const verses = Array.isArray(match.verses) ? match.verses : [];
      const reference = String(match.reference || fallbackReference).trim();

      if (reference || ids.length) {
        return {
          reference: reference || fallbackReference,
          ids,
          verseCount: Math.max(ids.length, verses.length)
        };
      }
    }
  }

  return {
    reference: fallbackReference,
    ids: [],
    verseCount: 0
  };
}

export function LiveRequestInbox({
  controller,
  actorId,
  liveSessionId
}: {
  controller: Controller;
  actorId: string;
  liveSessionId: string;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<string | null>(null);
  const [preparedBible, setPreparedBible] = useState<Record<string, PreparedBibleRequest>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await controller.refreshState().catch(() => null);
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [controller.refreshState]);

  const providers = controller.nodeState?.providers || [];
  const capabilitySet = useMemo(
    () => new Set(
      providers
        .filter(provider => provider.health === 'online' || provider.health === 'degraded')
        .flatMap(provider => provider.capabilities)
    ),
    [providers]
  );

  const requests = useMemo(
    () => (controller.nodeState?.state.requests || [])
      .filter(request =>
        (
          request.liveSessionId === liveSessionId ||
          request.payload.source === 'playlist-sync'
        ) &&
        (request.status === 'pending' || request.status === 'accepted')
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [controller.nodeState, liveSessionId]
  );

  const pendingCount = requests.filter(request =>
    request.payload.source !== 'playlist-sync' && request.status === 'pending'
  ).length;
  const readyCount = requests.filter(request =>
    request.status === 'accepted' &&
    (
      (request.kind === 'bible' && Boolean(preparedBible[request.id])) ||
      (request.kind === 'message' && capabilitySet.has('stage.message'))
    )
  ).length;

  function clearError(requestId: string) {
    setErrors(current => {
      if (!current[requestId]) return current;
      const next = { ...current };
      delete next[requestId];
      return next;
    });
  }

  function setRequestError(requestId: string, code: string) {
    setErrors(current => ({ ...current, [requestId]: code }));
  }

  async function setStatus(
    requestId: string,
    status: 'accepted' | 'rejected' | 'completed'
  ) {
    const busyKey = `${requestId}:status`;
    setBusy(busyKey);
    clearError(requestId);
    try {
      await controller.updateRequestStatus(requestId, status, actorId);
    } catch (error) {
      setRequestError(
        requestId,
        error instanceof Error ? error.message : 'request_status_failed'
      );
    } finally {
      setBusy(null);
    }
  }

  async function prepareBibleRequest(request: LiveRequest) {
    const reference = String(request.payload.reference || '').trim();
    if (!reference) return;

    const busyKey = `${request.id}:prepare`;
    setBusy(busyKey);
    clearError(request.id);
    try {
      if (!capabilitySet.has('bible.present')) {
        throw new Error('bible_present_unavailable');
      }

      if (!capabilitySet.has('bible.search')) {
        setPreparedBible(current => ({
          ...current,
          [request.id]: { reference, ids: [], verseCount: 0 }
        }));
        return;
      }

      const results = await controller.executeCommand({
        capability: 'bible.search',
        payload: { text: reference },
        liveSessionId,
        actorId,
        safetyLevel: 'normal'
      });
      const failed = firstCommandFailure(results);
      if (failed) throw new Error(failed.errorCode || 'provider_error');

      setPreparedBible(current => ({
        ...current,
        [request.id]: preparedBibleFromResults(results, reference)
      }));
    } catch (error) {
      setRequestError(
        request.id,
        error instanceof Error ? error.message : 'request_prepare_failed'
      );
    } finally {
      setBusy(null);
    }
  }

  async function takeBibleRequest(request: LiveRequest) {
    const prepared = preparedBible[request.id];
    const reference = prepared?.reference || String(request.payload.reference || '').trim();
    if (!reference) return;

    const busyKey = `${request.id}:take`;
    setBusy(busyKey);
    clearError(request.id);
    try {
      const payload: Record<string, unknown> = prepared?.ids.length
        ? { ids: prepared.ids }
        : { references: reference };

      const results = await controller.executeCommand({
        capability: 'bible.present',
        payload,
        liveSessionId,
        actorId,
        safetyLevel: 'normal'
      });
      const failed = firstCommandFailure(results);
      if (failed) throw new Error(failed.errorCode || 'provider_error');

      await controller.updateRequestStatus(request.id, 'completed', actorId);
      setPreparedBible(current => {
        const next = { ...current };
        delete next[request.id];
        return next;
      });
    } catch (error) {
      setRequestError(
        request.id,
        error instanceof Error ? error.message : 'request_take_failed'
      );
    } finally {
      setBusy(null);
    }
  }

  async function sendStageMessage(request: LiveRequest) {
    const message = String(request.payload.text || '').trim();
    if (!message) return;

    const busyKey = `${request.id}:stage`;
    setBusy(busyKey);
    clearError(request.id);
    try {
      const results = await controller.executeCommand({
        capability: 'stage.message',
        payload: {
          text: message,
          show: true,
          displayAhead: true
        },
        liveSessionId,
        actorId,
        safetyLevel: 'normal'
      });
      const failed = firstCommandFailure(results);
      if (failed) throw new Error(failed.errorCode || 'provider_error');

      await controller.updateRequestStatus(request.id, 'completed', actorId);
    } catch (error) {
      setRequestError(
        request.id,
        error instanceof Error ? error.message : 'request_stage_failed'
      );
    } finally {
      setBusy(null);
    }
  }

  if (!requests.length) return null;

  return (
    <section className="live-request-inbox">
      <div className="live-request-inbox-head">
        <div>
          <span className="eyebrow">{t('requestInbox.kicker')}</span>
          <h2>{t('requestInbox.title')}</h2>
          <p>{t('requestInbox.description')}</p>
        </div>
        <div className="request-inbox-summary" aria-label={t('requestInbox.summaryLabel')}>
          <span>
            <b>{pendingCount}</b>
            <small>{t('requestInbox.waiting')}</small>
          </span>
          <span className={readyCount > 0 ? 'ready' : ''}>
            <b>{readyCount}</b>
            <small>{t('requestInbox.ready')}</small>
          </span>
        </div>
      </div>

      <div className="live-request-list">
        {requests.map(request => {
          const isPlaylistUpdate =
            request.kind === 'message' &&
            request.payload.source === 'playlist-sync';

          if (isPlaylistUpdate) {
            const syncStatus = String(request.payload.syncStatus || 'needs_attention');
            const providerName = String(request.payload.providerName || 'provider');
            const added = stringList(request.payload.added);
            const removed = stringList(request.payload.removed);
            const moved = stringList(request.payload.moved);
            const unresolved = stringList(request.payload.unresolved);
            const summary =
              syncStatus === 'synced'
                ? t('requestInbox.playlistSynced', { provider: providerName })
                : syncStatus === 'failed'
                  ? t('requestInbox.playlistSyncFailed', { provider: providerName })
                  : t('requestInbox.playlistNeedsAttention');

            return (
              <article key={request.id} className={`live-request playlist-update status-${syncStatus}`}>
                <div className="live-request-copy">
                  <small>{t('requestInbox.playlistUpdate')}</small>
                  <strong>{summary}</strong>
                  <div className="playlist-change-list">
                    {added.length > 0 && (
                      <span><b>{t('requestInbox.added')}:</b> {added.join(', ')}</span>
                    )}
                    {removed.length > 0 && (
                      <span><b>{t('requestInbox.removed')}:</b> {removed.join(', ')}</span>
                    )}
                    {moved.length > 0 && (
                      <span><b>{t('requestInbox.moved')}:</b> {moved.join(', ')}</span>
                    )}
                    {unresolved.length > 0 && (
                      <span><b>{t('requestInbox.unresolved')}:</b> {unresolved.join(', ')}</span>
                    )}
                  </div>
                </div>
                <div className="live-request-actions">
                  <button
                    className="primary"
                    disabled={busy !== null}
                    onClick={() => void setStatus(request.id, 'completed')}
                  >
                    {busy === `${request.id}:status` ? '…' : t('requestInbox.acknowledge')}
                  </button>
                </div>
              </article>
            );
          }

          const label =
            request.kind === 'bible' ? request.payload.reference :
            request.kind === 'section' ? request.payload.section :
            request.kind === 'media' ? request.payload.query :
            request.payload.text;
          const prepared = preparedBible[request.id];
          const canPrepareBible =
            request.kind === 'bible' && capabilitySet.has('bible.present');
          const canSendStage =
            request.kind === 'message' && capabilitySet.has('stage.message');
          const requestBusy = busy?.startsWith(`${request.id}:`) === true;

          return (
            <article
              key={request.id}
              className={[
                'live-request',
                `kind-${request.kind}`,
                `status-${request.status}`,
                prepared ? 'is-prepared' : ''
              ].filter(Boolean).join(' ')}
            >
              <div className="live-request-copy">
                <div className="live-request-label-row">
                  <small>{t(`requestsSurface.kinds.${request.kind}`)}</small>
                  <span className={`request-status-chip status-${request.status}`}>
                    {t(`requestsSurface.status.${request.status}`)}
                  </span>
                </div>
                <strong>{String(label || '')}</strong>
                <span>
                  {request.status === 'accepted'
                    ? prepared
                      ? t('requestInbox.preparedHint')
                      : t('requestInbox.acceptedHint')
                    : t('requestInbox.pendingHint')}
                </span>

                {request.status === 'accepted' && (
                  <div className="request-execution-flow" aria-label={t('requestInbox.flowLabel')}>
                    <span className="done">{t('requestInbox.flow.requested')}</span>
                    <i />
                    <span className={prepared || canSendStage ? 'active' : ''}>
                      {t('requestInbox.flow.prepared')}
                    </span>
                    <i />
                    <span>{t('requestInbox.flow.executed')}</span>
                  </div>
                )}

                {prepared && (
                  <div className="request-prepared-state">
                    <b>{t('requestInbox.prepared')}</b>
                    <span>
                      {prepared.reference}
                      {prepared.verseCount > 0
                        ? ` · ${t('requestInbox.verseCount', { count: prepared.verseCount })}`
                        : ''}
                    </span>
                  </div>
                )}

                {request.status === 'accepted' &&
                  (request.kind === 'section' || request.kind === 'media') && (
                    <p className="request-manual-hint">{t('requestInbox.manualHint')}</p>
                  )}

                {request.status === 'accepted' &&
                  request.kind === 'bible' &&
                  !canPrepareBible && (
                    <p className="request-manual-hint">{t('requestInbox.bibleUnavailable')}</p>
                  )}

                {request.status === 'accepted' &&
                  request.kind === 'message' &&
                  !canSendStage && (
                    <p className="request-manual-hint">{t('requestInbox.stageUnavailable')}</p>
                  )}

                {errors[request.id] && (
                  <p className="request-action-error" role="alert">
                    {t('requestInbox.actionError', { code: errors[request.id] })}
                  </p>
                )}
              </div>

              <div className="live-request-actions">
                {request.status === 'pending' ? (
                  <>
                    <button
                      className="secondary"
                      disabled={requestBusy}
                      onClick={() => void setStatus(request.id, 'rejected')}
                    >
                      {t('requestInbox.reject')}
                    </button>
                    <button
                      className="primary"
                      disabled={requestBusy}
                      onClick={() => void setStatus(request.id, 'accepted')}
                    >
                      {busy === `${request.id}:status` ? '…' : t('requestInbox.accept')}
                    </button>
                  </>
                ) : request.kind === 'bible' && canPrepareBible ? (
                  <>
                    {!prepared ? (
                      <button
                        className="secondary request-prepare-action"
                        disabled={requestBusy}
                        onClick={() => void prepareBibleRequest(request)}
                      >
                        {busy === `${request.id}:prepare`
                          ? t('requestInbox.preparing')
                          : t('requestInbox.prepareBible')}
                      </button>
                    ) : (
                      <button
                        className="primary request-take-action"
                        disabled={requestBusy}
                        onClick={() => void takeBibleRequest(request)}
                      >
                        {busy === `${request.id}:take`
                          ? t('requestInbox.taking')
                          : t('requestInbox.take')}
                      </button>
                    )}
                    <button
                      className="ghost"
                      disabled={requestBusy}
                      onClick={() => void setStatus(request.id, 'completed')}
                    >
                      {t('requestInbox.complete')}
                    </button>
                  </>
                ) : request.kind === 'message' && canSendStage ? (
                  <>
                    <button
                      className="primary request-stage-action"
                      disabled={requestBusy}
                      onClick={() => void sendStageMessage(request)}
                    >
                      {busy === `${request.id}:stage`
                        ? t('requestInbox.sendingStage')
                        : t('requestInbox.sendStage')}
                    </button>
                    <button
                      className="ghost"
                      disabled={requestBusy}
                      onClick={() => void setStatus(request.id, 'completed')}
                    >
                      {t('requestInbox.complete')}
                    </button>
                  </>
                ) : (
                  <button
                    className="primary"
                    disabled={requestBusy}
                    onClick={() => void setStatus(request.id, 'completed')}
                  >
                    {busy === `${request.id}:status` ? '…' : t('requestInbox.complete')}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
