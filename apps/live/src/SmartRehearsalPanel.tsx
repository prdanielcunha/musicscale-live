import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  rehearseServicePlan,
  type CapabilitySnapshot,
  type ProviderRouteGroup
} from '@millionsnest/live-domain';
import type { useLiveNode } from './useLiveNode';

type Controller = ReturnType<typeof useLiveNode>;

export function SmartRehearsalPanel({
  controller
}: {
  controller: Controller;
}) {
  const { t } = useTranslation();
  const state = controller.nodeState?.state;
  const plan = state?.servicePlan || null;

  const report = useMemo(() => {
    if (!plan || !controller.nodeState) return null;

    const providers: CapabilitySnapshot[] = controller.nodeState.providers.map(provider => ({
      providerId: provider.providerId,
      capabilities: provider.capabilities,
      health: provider.health as CapabilitySnapshot['health'],
      observed: provider.observed
    }));

    return rehearseServicePlan({
      plan,
      providerLinks: state?.providerLinks || [],
      providers,
      routing: (controller.nodeState.routing || {}) as Partial<Record<ProviderRouteGroup, string>>,
      scenes: state?.scenes || []
    });
  }, [
    controller.nodeState,
    plan,
    state?.providerLinks,
    state?.scenes
  ]);

  if (!report) return null;

  const attention = report.findings.filter(
    finding => finding.severity === 'blocker' || finding.severity === 'warning'
  );

  return (
    <section className={[
      'smart-rehearsal-panel',
      report.safeToArm ? 'ready' : 'blocked'
    ].join(' ')}>
      <header>
        <div>
          <span className="eyebrow">{t('smartRehearsal.kicker')}</span>
          <h2>{t('smartRehearsal.title')}</h2>
          <p>{t('smartRehearsal.description')}</p>
        </div>
        <div className="smart-rehearsal-state">
          <small>{t('smartRehearsal.simulation')}</small>
          <strong>
            {report.safeToArm
              ? t('smartRehearsal.ready')
              : t('smartRehearsal.blocked')}
          </strong>
          <span>{t('smartRehearsal.zeroWrites')}</span>
        </div>
      </header>

      <div className="smart-rehearsal-metrics">
        <article>
          <small>{t('smartRehearsal.readyItems')}</small>
          <strong>{report.readyItems}/{report.totalItems}</strong>
        </article>
        <article>
          <small>{t('smartRehearsal.blockers')}</small>
          <strong>{report.blockers}</strong>
        </article>
        <article>
          <small>{t('smartRehearsal.warnings')}</small>
          <strong>{report.warnings}</strong>
        </article>
        <article>
          <small>{t('smartRehearsal.commands')}</small>
          <strong>{report.simulatedCommands}</strong>
        </article>
      </div>

      {attention.length === 0 ? (
        <div className="smart-rehearsal-empty">
          <strong>{t('smartRehearsal.noBlockers')}</strong>
          <span>{t('smartRehearsal.noBlockersHint')}</span>
        </div>
      ) : (
        <div className="smart-rehearsal-findings">
          {attention.slice(0, 12).map(finding => (
            <article
              key={finding.id}
              className={`severity-${finding.severity}`}
            >
              <div>
                <small>{t(`smartRehearsal.severity.${finding.severity}`)}</small>
                <strong>{finding.message}</strong>
                {finding.serviceItemId && (
                  <span>{finding.serviceItemId}</span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
