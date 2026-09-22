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
import {
  bibleRequestFromResults,
  type PreparedBibleRequest
} from './requestBible';
import {
  currentPresentationFromResults,
  sectionCandidatesFromResults,
  type PreparedSectionCandidate
} from './requestSection';

type Controller = ReturnType<typeof useLiveNode>;

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(String).map(item => item.trim()).filter(Boolean)
    : [];
}

function firstCommandFailure(results: CommandResult[]): CommandResult | null {
  return results.find(result => !result.accepted) || null;
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
  const [preparedSections, setPreparedSections] = useState<Record<string, PreparedSectionCandidate[]>>({});
  const [selectedSection, setSelectedSection] = useState<Record<string, string>>({});
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

  const biblePresentProviders = useMemo(
    () => providers.filter(provider =>
      (provider.health === 'online' || provider.health === 'degraded') &&
      provider.capabilities.includes('bible.present')
    ),
    [providers]
  );

  const bibleSearchProviders = useMemo(
    () => providers.filter(provider =>
      (provider.health === 'online' || provider.health === 'degraded') &&
      provider.capabilities.includes('bible.search')
    ),
    [providers]
  );

  const routedBibleProvider = useMemo(() => {
    const configured = controller.nodeState?.routing?.bible;
    if (configured) {
      return biblePresentProviders.find(provider => provider.providerId === configured) || null;
    }
    return biblePresentProviders.length === 1 ? biblePresentProviders[0]! : null;
  }, [controller.nodeState?.routing?.bible, biblePresentProviders]);

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

  const sectionProviders = useMemo(
    () => providers.filter(provider =>
      (provider.health === 'online' || provider.health === 'degraded') &&
      provider.capabilities.includes('presentation.slides.read') &&
      provider.capabilities.includes('presentation.navigation')
    ),
    [providers]
  );

  const sectionProvider = useMemo(() => {
    const configured = controller.nodeState?.routing?.presentation;
    if (configured) {
      return sectionProviders.find(provider => provider.providerId === configured) || null;
    }
    return sectionProviders.length === 1 ? sectionProviders[0]! : null;
  }, [controller.nodeState?.routing?.presentation, sectionProviders]);

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
      (request.kind === 'section' && Boolean(selectedSection[request.id])) ||
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
  ): Promise<boolean> {
    const busyKey = `${requestId}:status`;
    setBusy(busyKey);
    clearError(requestId);
    try {
      await controller.updateRequestStatus(requestId, status, actorId);
      return true;
    } catch (error) {
      setRequestError(
        requestId,
        error instanceof Error ? error.message : 'request_status_failed'
      );
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function acceptAndPrepare(request: LiveRequest) {
    const accepted = await setStatus(request.id, 'accepted');
    if (!accepted) return;

    // Preparation is intentionally automatic after acceptance because it does
    // not change any public output. The operator still owns the final TAKE.
    if (request.kind === 'bible') {
      await prepareBibleRequest(request);
      return;
    }
    if (request.kind === 'section') {
      await prepareSectionRequest(request);
      return;
    }
    if (request.kind === 'media') {
      await prepareMediaRequest(request);
    }
  }

  async function prepareBibleRequest(request: LiveRequest) {
    const reference = String(request.payload.reference || '').trim();
    if (!reference) return;

    const busyKey = `${request.id}:prepare`;
    setBusy(busyKey);
    clearError(request.id);
    try {
      const requestedProviderId = String(request.payload.providerId || '').trim();
      const requestedIds = Array.isArray(request.payload.ids)
        ? request.payload.ids.map(String).filter(Boolean)
        : [];
      const requestedProvider = requestedProviderId
        ? biblePresentProviders.find(provider => provider.providerId === requestedProviderId) || null
        : null;
      const targetProvider = requestedProvider || routedBibleProvider;

      if (requestedProviderId && !requestedProvider) {
        throw new Error('bible_requested_provider_unavailable');
      }
      if (!targetProvider) {
        throw new Error(
          biblePresentProviders.length > 1
            ? 'bible_route_required'
            : 'bible_present_unavailable'
        );
      }

      if (request.payload.exact === true && requestedIds.length) {
        setPreparedBible(current => ({
          ...current,
          [request.id]: {
            reference,
            ids: requestedIds,
            verseCount: requestedIds.length,
            providerId: targetProvider.providerId
          }
        }));
        return;
      }

      const searchProvider =
        bibleSearchProviders.find(provider =>
          provider.providerId === targetProvider.providerId
        ) || null;
      if (!searchProvider) {
        setPreparedBible(current => ({
          ...current,
          [request.id]: {
            reference,
            ids: [],
            verseCount: 0,
            providerId: targetProvider.providerId
          }
        }));
        return;
      }

      const results = await controller.executeCommand({
        capability: 'bible.search',
        payload: { text: reference },
        liveSessionId,
        actorId,
        targetProviderIds: [searchProvider.providerId],
        safetyLevel: 'normal'
      });
      const failed = firstCommandFailure(results);
      if (failed) throw new Error(failed.errorCode || 'provider_error');

      setPreparedBible(current => ({
        ...current,
        [request.id]: bibleRequestFromResults(results, reference)
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

      const targetProviderId =
        prepared?.providerId ||
        String(request.payload.providerId || '').trim();

      const results = await controller.executeCommand({
        capability: 'bible.present',
        payload,
        liveSessionId,
        actorId,
        targetProviderIds: targetProviderId ? [targetProviderId] : undefined,
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

  async function prepareSectionRequest(request: LiveRequest) {
    const section = String(request.payload.section || '').trim();
    if (!section) return;

    const busyKey = `${request.id}:section-prepare`;
    setBusy(busyKey);
    clearError(request.id);

    try {
      const requestedProviderId = String(request.payload.providerId || '').trim();
      const requestedProvider = requestedProviderId
        ? sectionProviders.find(provider => provider.providerId === requestedProviderId) || null
        : null;
      const targetProvider = requestedProvider || sectionProvider;

      if (requestedProviderId && !requestedProvider) {
        throw new Error('section_requested_provider_unavailable');
      }
      if (!targetProvider) {
        throw new Error(
          sectionProviders.length > 1
            ? 'section_route_required'
            : 'section_provider_unavailable'
        );
      }

      const results = await controller.executeCommand({
        capability: 'presentation.slides.read',
        payload: {},
        liveSessionId,
        actorId,
        targetProviderIds: [targetProvider.providerId],
        safetyLevel: 'normal'
      });
      const failed = firstCommandFailure(results);
      if (failed) throw new Error(failed.errorCode || 'provider_error');

      const requestedPresentationId = String(request.payload.presentationId || '').trim();
      const requestedSongId = String(request.payload.songId || '').trim();
      if (requestedPresentationId || requestedSongId) {
        const presentation = currentPresentationFromResults(
          results,
          targetProvider.providerId
        );
        const currentPresentationId = String(presentation?.id || '').trim();
        const currentSongId = String(presentation?.song_id || '').trim();
        if (
          (requestedPresentationId && currentPresentationId !== requestedPresentationId) ||
          (requestedSongId && currentSongId !== requestedSongId)
        ) {
          throw new Error('section_request_presentation_changed');
        }
      }

      const candidates = sectionCandidatesFromResults(
        results,
        targetProvider.providerId,
        targetProvider.displayName || targetProvider.providerKey || 'provider',
        section
      );

      if (!candidates.length) {
        throw new Error('section_request_no_markers');
      }

      const exact = request.payload.exact === true;
      const requestedIndex = Number(request.payload.index);
      const exactCandidate =
        exact && Number.isInteger(requestedIndex) && requestedIndex >= 0
          ? candidates.find(candidate => candidate.index === requestedIndex)
          : undefined;
      if (exact && !exactCandidate) {
        throw new Error('section_request_exact_marker_missing');
      }

      const orderedCandidates = exactCandidate
        ? [
            exactCandidate,
            ...candidates.filter(candidate => candidate.id !== exactCandidate.id)
          ]
        : candidates;

      setPreparedSections(current => ({
        ...current,
        [request.id]: orderedCandidates
      }));
      setSelectedSection(current => ({
        ...current,
        [request.id]: orderedCandidates[0]!.id
      }));
    } catch (error) {
      setRequestError(
        request.id,
        error instanceof Error ? error.message : 'section_request_prepare_failed'
      );
    } finally {
      setBusy(null);
    }
  }

  async function takeSectionRequest(request: LiveRequest) {
    const candidates = preparedSections[request.id] || [];
    const selectedId = selectedSection[request.id];
    const candidate = candidates.find(item => item.id === selectedId);
    if (!candidate) return;

    const busyKey = `${request.id}:section-take`;
    setBusy(busyKey);
    clearError(request.id);

    try {
      const results = await controller.executeCommand({
        capability: 'presentation.navigation',
        payload: {
          action: 'goto',
          index: candidate.index
        },
        liveSessionId,
        actorId,
        targetProviderIds: [candidate.providerId],
        safetyLevel: 'guarded',
        confirmed: true
      });
      const failed = firstCommandFailure(results);
      if (failed) throw new Error(failed.errorCode || 'section_navigation_failed');

      await controller.updateRequestStatus(request.id, 'completed', actorId);
      setPreparedSections(current => {
        const next = { ...current };
        delete next[request.id];
        return next;
      });
      setSelectedSection(current => {
        const next = { ...current };
        delete next[request.id];
        return next;
      });
    } catch (error) {
      setRequestError(
        request.id,
        error instanceof Error ? error.message : 'section_request_take_failed'
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
          const sectionCandidates = preparedSections[request.id] || [];
          const selectedSectionId = selectedSection[request.id];
          const mediaCandidates = preparedMedia[request.id] || [];
          const selectedMediaId = selectedMedia[request.id];
          const canPrepareBible =
            request.kind === 'bible' && capabilitySet.has('bible.present');
          const requestedSectionProviderId =
            request.kind === 'section'
              ? String(request.payload.providerId || '').trim()
              : '';
          const requestedSectionProvider = requestedSectionProviderId
            ? sectionProviders.find(provider =>
                provider.providerId === requestedSectionProviderId
              ) || null
            : null;
          const canPrepareSection =
            request.kind === 'section' &&
            Boolean(requestedSectionProvider || sectionProvider);
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
                prepared || selectedSectionId || selectedMediaId ? 'is-prepared' : ''
              ].filter(Boolean).join(' ')}
            >
              <div className="live-request-copy">
                <div className="live-request-label-row">
                  <small>{t(`requestsSurface.kinds.${request.kind}`)}</small>
                  <div className="request-label-badges">
                    {Boolean(request.payload.sourceSurface) && (
                      <em className="request-source-chip">
                        {t(`requestInbox.sources.${String(request.payload.sourceSurface)}`, {
                          defaultValue: String(request.payload.sourceSurface)
                        })}
                      </em>
                    )}
                    <span className={`request-status-chip status-${request.status}`}>
                      {t(`requestsSurface.status.${request.status}`)}
                    </span>
                  </div>
                </div>
                <strong>{String(label || '')}</strong>
                <span>
                  {request.status === 'accepted'
                    ? prepared || selectedSectionId || selectedMediaId
                      ? t('requestInbox.preparedHint')
                      : t('requestInbox.acceptedHint')
                    : t('requestInbox.pendingHint')}
                </span>

                {request.status === 'accepted' && (
                  <div className="request-execution-flow" aria-label={t('requestInbox.flowLabel')}>
                    <span className="done">{t('requestInbox.flow.requested')}</span>
                    <i />
                    <span className={prepared || selectedSectionId || selectedMediaId || canSendStage ? 'active' : ''}>
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

                {request.kind === 'section' && sectionCandidates.length > 0 && (
                  <div className="request-section-prepared">
                    <div className="request-section-prepared-head">
                      <div>
                        <b>{t('requestInbox.sectionPrepared')}</b>
                        <span>{t('requestInbox.sectionPreparedHint', { count: sectionCandidates.length })}</span>
                      </div>
                      <button
                        type="button"
                        className="ghost"
                        disabled={requestBusy}
                        onClick={() => void prepareSectionRequest(request)}
                      >
                        {t('requestInbox.sectionRefresh')}
                      </button>
                    </div>
                    <div className="request-section-candidates" role="listbox" aria-label={t('requestInbox.sectionResultsLabel')}>
                      {sectionCandidates.map(candidate => {
                        const active = selectedSectionId === candidate.id;
                        return (
                          <button
                            key={candidate.id}
                            type="button"
                            role="option"
                            aria-selected={active}
                            className={active ? 'active' : ''}
                            onClick={() => setSelectedSection(current => ({
                              ...current,
                              [request.id]: candidate.id
                            }))}
                          >
                            <span className="request-section-index">
                              {String(candidate.index + 1).padStart(2, '0')}
                            </span>
                            <span className="request-section-copy">
                              <strong>{candidate.label}</strong>
                              <small>
                                {candidate.excerpt || candidate.providerName}
                              </small>
                            </span>
                            <em>{active ? t('requestInbox.selected') : t('requestInbox.select')}</em>
                          </button>
                        );
                      })}
                    </div>
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
                  request.kind === 'section' &&
                  !canPrepareSection && (
                    <p className="request-manual-hint">
                      {sectionProviders.length > 1
                        ? t('requestInbox.sectionRouteRequired')
                        : t('requestInbox.sectionUnavailable')}
                    </p>
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
                      onClick={() => void acceptAndPrepare(request)}
                    >
                      {busy?.startsWith(`${request.id}:`)
                        ? '…'
                        : request.kind === 'message'
                          ? t('requestInbox.accept')
                          : t('requestInbox.acceptPrepare')}
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
                ) : request.kind === 'section' && canPrepareSection ? (
                  <>
                    {sectionCandidates.length === 0 ? (
                      <button
                        className="secondary request-prepare-action"
                        disabled={requestBusy}
                        onClick={() => void prepareSectionRequest(request)}
                      >
                        {busy === `${request.id}:section-prepare`
                          ? t('requestInbox.sectionPreparing')
                          : t('requestInbox.prepareSection')}
                      </button>
                    ) : (
                      <button
                        className="primary request-take-action"
                        disabled={requestBusy || !selectedSectionId}
                        onClick={() => void takeSectionRequest(request)}
                      >
                        {busy === `${request.id}:section-take`
                          ? t('requestInbox.taking')
                          : t('requestInbox.takeSection')}
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
