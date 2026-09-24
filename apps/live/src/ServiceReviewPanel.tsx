import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  buildServiceReview,
  type LiveSessionEvent,
  type ServiceReviewReport
} from '@millionsnest/live-domain';
import type { useLiveNode } from './useLiveNode';

type Controller = ReturnType<typeof useLiveNode>;

export function ServiceReviewPanel({
  controller,
  liveSessionId
}: {
  controller: Controller;
  liveSessionId: string;
}) {
  const { t } = useTranslation();
  const plan = controller.nodeState?.state.servicePlan || null;
  const [events, setEvents] = useState<LiveSessionEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!plan || !liveSessionId) return;
    setLoading(true);
    setError(null);
    try {
      const page = await controller.listEvents(liveSessionId, 250);
      setEvents(page.events);
      setLoaded(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'service_review_failed');
    } finally {
      setLoading(false);
    }
  }, [controller.listEvents, liveSessionId, plan?.id, plan?.revision]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const report: ServiceReviewReport | null = useMemo(() => {
    if (!plan || !loaded) return null;
    return buildServiceReview({
      plan,
      events,
      liveSessionId
    });
  }, [events, liveSessionId, loaded, plan]);

  if (!plan) return null;

  return (
    <section className="service-review-panel">
      <header>
        <div>
          <span className="eyebrow">{t('serviceReview.kicker')}</span>
          <h2>{t('serviceReview.title')}</h2>
          <p>{t('serviceReview.description')}</p>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={loading}
          onClick={() => void refresh()}
        >
          {loading ? t('serviceReview.refreshing') : t('serviceReview.refresh')}
        </button>
      </header>

      {error && (
        <div className="service-review-error" role="status">
          <strong>{t('serviceReview.errorTitle')}</strong>
          <span>{error}</span>
        </div>
      )}

      {!report ? (
        <div className="service-review-loading" role="status">
          {t('serviceReview.loading')}
        </div>
      ) : (
        <>
          <div className="service-review-metrics">
            <article>
              <small>{t('serviceReview.executed')}</small>
              <strong>{report.executedPlannedItems}/{report.plannedItems}</strong>
            </article>
            <article>
              <small>{t('serviceReview.skipped')}</small>
              <strong>{report.explicitlySkippedItems}</strong>
            </article>
            <article>
              <small>{t('serviceReview.adHoc')}</small>
              <strong>{report.adHocRunOfShowActions}</strong>
            </article>
            <article>
              <small>{t('serviceReview.failures')}</small>
              <strong>{report.errorEvents}</strong>
            </article>
            <article>
              <small>{t('serviceReview.requests')}</small>
              <strong>{report.requestSummary.created}</strong>
            </article>
            <article>
              <small>{t('serviceReview.p95')}</small>
              <strong>
                {typeof report.providerLatency.p95Ms === 'number'
                  ? `${Math.round(report.providerLatency.p95Ms)} ms`
                  : '—'}
              </strong>
            </article>
          </div>

          <div className="service-review-grid">
            <article className="service-review-block">
              <div className="service-review-block-head">
                <div>
                  <small>{t('serviceReview.planComparisonKicker')}</small>
                  <strong>{t('serviceReview.planComparison')}</strong>
                </div>
                <span>{t('serviceReview.notObservedNeutral')}</span>
              </div>
              <div className="service-review-items">
                {report.items.map(item => (
                  <div key={item.serviceItemId} className={`status-${item.status}`}>
                    <div>
                      <strong>{item.title}</strong>
                      <small>{item.type} · {item.serviceItemId}</small>
                    </div>
                    <span>{t(`serviceReview.itemStatus.${item.status}`)}</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="service-review-block">
              <div className="service-review-block-head">
                <div>
                  <small>{t('serviceReview.attentionKicker')}</small>
                  <strong>{t('serviceReview.attention')}</strong>
                </div>
              </div>

              {report.failures.length === 0 && report.adHoc.length === 0 ? (
                <div className="service-review-empty">
                  <strong>{t('serviceReview.noAttention')}</strong>
                  <span>{t('serviceReview.noAttentionHint')}</span>
                </div>
              ) : (
                <div className="service-review-attention">
                  {report.failures.slice(0, 8).map(failure => (
                    <div key={failure.eventId} className="failure">
                      <small>{t('serviceReview.failure')}</small>
                      <strong>{failure.type}</strong>
                      <span>
                        {failure.errorCodes.length
                          ? failure.errorCodes.join(', ')
                          : failure.correlationId}
                      </span>
                    </div>
                  ))}
                  {report.adHoc.slice(0, 8).map(entry => (
                    <div key={entry.eventId} className="adhoc">
                      <small>{t('serviceReview.adHocAction')}</small>
                      <strong>{entry.title || entry.type}</strong>
                      <span>{entry.type}</span>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </div>

          <footer className="service-review-facts">
            {t('serviceReview.factsOnly')}
          </footer>
        </>
      )}
    </section>
  );
}
