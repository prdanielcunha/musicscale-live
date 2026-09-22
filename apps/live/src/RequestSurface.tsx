import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RequestKind } from '@millionsnest/live-domain';
import type { useLiveNode } from './useLiveNode';
import {
  sectionPresentationContext,
  type PreparedSectionCandidate
} from './requestSection';

type Controller = ReturnType<typeof useLiveNode>;

const PASTOR_KINDS: RequestKind[] = ['bible', 'message', 'media'];
const CONDUCTOR_KINDS: RequestKind[] = ['section', 'message'];

export function RequestSurface({
  controller,
  actorId,
  liveSessionId,
  mode
}: {
  controller: Controller;
  actorId: string;
  liveSessionId: string;
  mode: 'pastor' | 'conductor';
}) {
  const { t } = useTranslation();
  const kinds = mode === 'pastor' ? PASTOR_KINDS : CONDUCTOR_KINDS;
  const [kind, setKind] = useState<RequestKind>(kinds[0]!);
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [sendingQuick, setSendingQuick] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      if (cancelled || document.visibilityState === 'hidden') return;
      await controller.refreshState().catch(() => null);
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1400);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [controller.refreshState]);

  const conductorContext = useMemo(() => {
    if (mode !== 'conductor') return null;
    const providers = controller.nodeState?.providers || [];
    const contexts = providers
      .filter(provider =>
        provider.health === 'online' || provider.health === 'degraded'
      )
      .map(provider => {
        const presentation = provider.observed?.currentPresentation;
        if (!presentation || typeof presentation !== 'object') return null;
        return sectionPresentationContext(
          presentation as Record<string, unknown>,
          provider.providerId,
          provider.displayName || provider.providerKey || 'provider'
        );
      })
      .filter((value): value is NonNullable<typeof value> => Boolean(value));

    const routedId = controller.nodeState?.routing?.presentation;
    if (routedId) {
      return contexts.find(context => context.providerId === routedId) || contexts[0] || null;
    }
    return contexts[0] || null;
  }, [controller.nodeState, mode]);

  const ownRequests = useMemo(
    () => (controller.nodeState?.state.requests || [])
      .filter(request =>
        request.liveSessionId === liveSessionId &&
        request.actorId === actorId
      )
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 8),
    [actorId, controller.nodeState, liveSessionId]
  );

  async function submitPayload(
    requestKind: RequestKind,
    payload: Record<string, unknown>
  ) {
    await controller.submitRequest({
      liveSessionId,
      actorId,
      kind: requestKind,
      payload: {
        ...payload,
        sourceSurface: mode
      }
    });
  }

  async function submit() {
    const text = value.trim();
    if (!text || sending) return;
    setSending(true);
    setSent(false);
    try {
      const payload =
        kind === 'bible' ? { reference: text } :
        kind === 'section' ? { section: text } :
        kind === 'media' ? { query: text } :
        { text };

      await submitPayload(kind, payload);
      setValue('');
      setSent(true);
    } finally {
      setSending(false);
    }
  }

  async function requestSectionNow(section: PreparedSectionCandidate) {
    if (!conductorContext || sendingQuick) return;
    setSendingQuick(section.id);
    setSent(false);
    try {
      await submitPayload('section', {
        section: section.label,
        providerId: conductorContext.providerId,
        presentationId: conductorContext.presentationId,
        songId: conductorContext.songId,
        index: section.index,
        exact: true
      });
      setSent(true);
    } finally {
      setSendingQuick(null);
    }
  }

  async function cancelRequest(requestId: string) {
    if (cancellingId) return;
    setCancellingId(requestId);
    try {
      await controller.updateRequestStatus(requestId, 'rejected', actorId);
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <section className="request-surface">
      <div className="request-surface-head">
        <div>
          <span className="eyebrow">{t(`requestsSurface.${mode}.kicker`)}</span>
          <h2>{t(`requestsSurface.${mode}.title`)}</h2>
          <p>{t(`requestsSurface.${mode}.description`)}</p>
        </div>
        <div className="request-safe-pill">
          <span />
          <strong>{t('requestsSurface.safeFlow')}</strong>
          <small>{t('requestsSurface.safeFlowHint')}</small>
        </div>
      </div>

      <div className="request-flow-rail" aria-label={t('requestsSurface.flowLabel')}>
        <span><b>1</b><small>{t('requestsSurface.flowSteps.request')}</small></span>
        <i />
        <span><b>2</b><small>{t('requestsSurface.flowSteps.prepare')}</small></span>
        <i />
        <span><b>3</b><small>{t('requestsSurface.flowSteps.execute')}</small></span>
      </div>

      {mode === 'conductor' && conductorContext && (
        <section className="conductor-live-context">
          <header>
            <div>
              <span>{t('requestsSurface.conductorContext.kicker')}</span>
              <strong>
                {conductorContext.title || t('requestsSurface.conductorContext.songFallback')}
              </strong>
              <small>
                {t('requestsSurface.conductorContext.provider', {
                  provider: conductorContext.providerName
                })}
              </small>
            </div>
            <em>{t('requestsSurface.conductorContext.safe')}</em>
          </header>

          <div className="conductor-section-rail">
            {conductorContext.sections.map(section => {
              const current = conductorContext.currentSectionId === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  className={current ? 'current' : ''}
                  disabled={Boolean(sendingQuick)}
                  onClick={() => void requestSectionNow(section)}
                >
                  <small>{current
                    ? t('requestsSurface.conductorContext.now')
                    : t('requestsSurface.conductorContext.request')}</small>
                  <strong>{section.label}</strong>
                  <span>{section.excerpt || t('requestsSurface.conductorContext.sectionReady')}</span>
                  <em>
                    {sendingQuick === section.id
                      ? '…'
                      : t('requestsSurface.conductorContext.send')}
                  </em>
                </button>
              );
            })}
          </div>
          <p>{t('requestsSurface.conductorContext.hint')}</p>
        </section>
      )}

      <div className="request-compose">
        <div className="request-kind-tabs">
          {kinds.map(item => (
            <button
              key={item}
              className={kind === item ? 'active' : ''}
              onClick={() => setKind(item)}
            >
              {t(`requestsSurface.kinds.${item}`)}
            </button>
          ))}
        </div>
        <p className="request-kind-hint">{t(`requestsSurface.kindHints.${kind}`)}</p>
        <div className="request-input-row">
          <input
            value={value}
            onChange={event => setValue(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') void submit();
            }}
            placeholder={t(`requestsSurface.placeholders.${kind}`)}
          />
          <button
            className="primary"
            disabled={!value.trim() || sending}
            onClick={() => void submit()}
          >
            {sending ? '…' : t('requestsSurface.send')}
          </button>
        </div>
        {sent && <p className="request-sent">{t('requestsSurface.sent')}</p>}
      </div>

      <div className="request-history">
        <div className="request-history-head">
          <strong>{t('requestsSurface.myRequests')}</strong>
          <small>{t('requestsSurface.operatorDecides')}</small>
        </div>
        {ownRequests.length ? ownRequests.map(request => {
          const label =
            request.kind === 'bible' ? request.payload.reference :
            request.kind === 'section' ? request.payload.section :
            request.kind === 'media' ? request.payload.query :
            request.payload.text;
          return (
            <article key={request.id} className={`request-history-item status-${request.status}`}>
              <div>
                <small>{t(`requestsSurface.kinds.${request.kind}`)}</small>
                <strong>{String(label || '')}</strong>
              </div>
              <div className="request-history-status">
                <span>{t(`requestsSurface.status.${request.status}`)}</span>
                {request.status === 'pending' && (
                  <button
                    type="button"
                    disabled={Boolean(cancellingId)}
                    onClick={() => void cancelRequest(request.id)}
                  >
                    {cancellingId === request.id
                      ? '…'
                      : t('requestsSurface.cancel')}
                  </button>
                )}
              </div>
            </article>
          );
        }) : (
          <p className="muted">{t('requestsSurface.empty')}</p>
        )}
      </div>
    </section>
  );
}
