import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CommandResult, LiveRequest } from '@millionsnest/live-domain';
import type { useLiveNode } from './useLiveNode';
import {
  liveDropRequestMediaCandidates,
  normalizeRequestMediaResults,
  type PreparedRequestMediaCandidate,
  type RequestMediaKind
} from './requestMedia';

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
  const [preparedMedia, setPreparedMedia] = useState<Record<string, PreparedRequestMediaCandidate[]>>({});
  const [selectedMedia, setSelectedMedia] = useState<Record<string, string>>({});
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

  const mediaSearchProviders = useMemo(
    () => providers.filter(provider =>
      (provider.health === 'online' || provider.health === 'degraded') &&
      provider.capabilities.includes('media.search') &&
      provider.capabilities.includes('media.open')
    ),
    [providers]
  );

  const mediaOpenProviders = useMemo(
    () => providers.filter(provider =>
      (provider.health === 'online' || provider.health === 'degraded') &&
      provider.capabilities.includes('media.open')
    ),
    [providers]
  );

  const routedMediaProvider = useMemo(() => {
    const configured = controller.nodeState?.routing?.media;
    if (configured) {
      return mediaOpenProviders.find(provider => provider.providerId === configured) || null;
    }
    return mediaOpenProviders.length === 1 ? mediaOpenProviders[0]! : null;
  }, [controller.nodeState?.routing?.media, mediaOpenProviders]);

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
      (request.kind === 'media' && Boolean(selectedMedia[request.id])) ||
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

  async function prepareMediaRequest(request: LiveRequest) {
    const query = String(request.payload.query || '').trim();
    if (!query) return;

    const busyKey = `${request.id}:media-search`;
    setBusy(busyKey);
    clearError(request.id);

    try {
      const local = liveDropRequestMediaCandidates(
        controller.nodeState?.liveDrop || [],
        query
      );

      const kinds: RequestMediaKind[] = ['video', 'image', 'audio'];
      const providerBatches = await Promise.all(
        mediaSearchProviders.flatMap(provider =>
          kinds.map(async kind => {
            const results = await controller.executeCommand({
              capability: 'media.search',
              payload: {
                kind,
                filter: query,
                includeMetadata: true,
                includeThumbnail: kind !== 'audio'
              },
              liveSessionId,
              actorId,
              targetProviderIds: [provider.providerId],
              safetyLevel: 'normal'
            }).catch(() => []);

            return normalizeRequestMediaResults(
              results,
              provider.providerId,
              provider.displayName || provider.providerKey || 'provider',
              kind
            );
          })
        )
      );

      const candidates = [...local, ...providerBatches.flat()]
        .filter((candidate, index, all) =>
          all.findIndex(item => item.id === candidate.id) === index
        )
        .slice(0, 16);

      if (!candidates.length) {
        throw new Error('media_request_no_results');
      }

      setPreparedMedia(current => ({
        ...current,
        [request.id]: candidates
      }));
      setSelectedMedia(current => ({
        ...current,
        [request.id]: candidates[0]!.id
      }));
    } catch (error) {
      setRequestError(
        request.id,
        error instanceof Error ? error.message : 'media_request_search_failed'
      );
    } finally {
      setBusy(null);
    }
  }

  async function takeMediaRequest(request: LiveRequest) {
    const candidates = preparedMedia[request.id] || [];
    const selectedId = selectedMedia[request.id];
    const candidate = candidates.find(item => item.id === selectedId);
    if (!candidate) return;

    const busyKey = `${request.id}:media-take`;
    setBusy(busyKey);
    clearError(request.id);

    try {
      if (candidate.source === 'live-drop') {
        if (!candidate.assetId) throw new Error('live_drop_asset_required');
        if (!routedMediaProvider) {
          throw new Error(
            mediaOpenProviders.length > 1
              ? 'media_route_required'
              : 'media_open_unavailable'
          );
        }

        const response = await controller.openLiveDrop(candidate.assetId, {
          actorId,
          liveSessionId,
          providerId: routedMediaProvider.providerId
        });
        const failed = response.results.find(result => !result.accepted);
        if (failed) throw new Error(failed.errorCode || 'media_open_failed');
      } else {
        if (!candidate.providerId) throw new Error('media_provider_required');
        const results = await controller.executeCommand({
          capability: 'media.open',
          payload: {
            kind: candidate.kind,
            file: candidate.name
          },
          liveSessionId,
          actorId,
          targetProviderIds: [candidate.providerId],
          safetyLevel: 'guarded',
          confirmed: true
        });
        const failed = firstCommandFailure(results);
        if (failed) throw new Error(failed.errorCode || 'media_open_failed');
      }

      await controller.updateRequestStatus(request.id, 'completed', actorId);
      setPreparedMedia(current => {
        const next = { ...current };
        delete next[request.id];
        return next;
      });
      setSelectedMedia(current => {
        const next = { ...current };
        delete next[request.id];
        return next;
      });
    } catch (error) {
      setRequestError(
        request.id,
        error instanceof Error ? error.message : 'media_request_take_failed'
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
          const mediaCandidates = preparedMedia[request.id] || [];
          const selectedMediaId = selectedMedia[request.id];
          const canPrepareBible =
            request.kind === 'bible' && capabilitySet.has('bible.present');
          const canPrepareMedia =
            request.kind === 'media' &&
            (
              mediaSearchProviders.length > 0 ||
              (controller.nodeState?.liveDrop || []).some(asset =>
                asset.status === 'ready' &&
                (asset.mediaType === 'video' || asset.mediaType === 'image' || asset.mediaType === 'audio')
              )
            ) &&
            mediaOpenProviders.length > 0;
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
                prepared || selectedMediaId ? 'is-prepared' : ''
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
                    ? prepared || selectedMediaId
                      ? t('requestInbox.preparedHint')
                      : t('requestInbox.acceptedHint')
                    : t('requestInbox.pendingHint')}
                </span>

                {request.status === 'accepted' && (
                  <div className="request-execution-flow" aria-label={t('requestInbox.flowLabel')}>
                    <span className="done">{t('requestInbox.flow.requested')}</span>
                    <i />
                    <span className={prepared || selectedMediaId || canSendStage ? 'active' : ''}>
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

                {request.kind === 'media' && mediaCandidates.length > 0 && (
                  <div className="request-media-prepared">
                    <div className="request-media-prepared-head">
                      <div>
                        <b>{t('requestInbox.mediaPrepared')}</b>
                        <span>{t('requestInbox.mediaPreparedHint', { count: mediaCandidates.length })}</span>
                      </div>
                      <button
                        type="button"
                        className="ghost"
                        disabled={requestBusy}
                        onClick={() => void prepareMediaRequest(request)}
                      >
                        {t('requestInbox.mediaSearchAgain')}
                      </button>
                    </div>
                    <div className="request-media-candidates" role="listbox" aria-label={t('requestInbox.mediaResultsLabel')}>
                      {mediaCandidates.map(candidate => {
                        const active = selectedMediaId === candidate.id;
                        return (
                          <button
                            key={candidate.id}
                            type="button"
                            role="option"
                            aria-selected={active}
                            className={active ? 'active' : ''}
                            onClick={() => setSelectedMedia(current => ({
                              ...current,
                              [request.id]: candidate.id
                            }))}
                          >
                            <span className="request-media-thumb">
                              {candidate.thumbnail ? (
                                <img src={candidate.thumbnail} alt="" />
                              ) : (
                                <b>{candidate.kind.slice(0, 1).toUpperCase()}</b>
                              )}
                            </span>
                            <span className="request-media-candidate-copy">
                              <strong title={candidate.name}>{candidate.name}</strong>
                              <small>
                                {candidate.providerName || t('requestInbox.localMedia')}
                                {' · '}
                                {t(`universalLibrary.kinds.${candidate.kind}`)}
                                {candidate.metadata ? ` · ${candidate.metadata}` : ''}
                              </small>
                            </span>
                            <em>{active ? t('requestInbox.selected') : t('requestInbox.select')}</em>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {request.status === 'accepted' &&
                  request.kind === 'section' && (
                    <p className="request-manual-hint">{t('requestInbox.sectionManualHint')}</p>
                  )}

                {request.status === 'accepted' &&
                  request.kind === 'media' &&
                  !canPrepareMedia && (
                    <p className="request-manual-hint">{t('requestInbox.mediaUnavailable')}</p>
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
                    {t('requestInbox.actionError', {
                      message: t(`requestInbox.errors.${errors[request.id]}`, {
                        defaultValue: errors[request.id]
                      })
                    })}
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
                ) : request.kind === 'media' && canPrepareMedia ? (
                  <>
                    {mediaCandidates.length === 0 ? (
                      <button
                        className="secondary request-prepare-action"
                        disabled={requestBusy}
                        onClick={() => void prepareMediaRequest(request)}
                      >
                        {busy === `${request.id}:media-search`
                          ? t('requestInbox.mediaSearching')
                          : t('requestInbox.prepareMedia')}
                      </button>
                    ) : (
                      <button
                        className="primary request-take-action"
                        disabled={requestBusy || !selectedMediaId}
                        onClick={() => void takeMediaRequest(request)}
                      >
                        {busy === `${request.id}:media-take`
                          ? t('requestInbox.taking')
                          : t('requestInbox.takeMedia')}
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
