import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { useLiveNode } from './useLiveNode';

type Controller = ReturnType<typeof useLiveNode>;

export function PeerNodeStudio({
  controller
}: {
  controller: Controller;
}) {
  const { t } = useTranslation();
  const [address, setAddress] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  const peers = controller.nodeState?.peers || [];
  const providers = controller.nodeState?.providers || [];

  const providersByNode = useMemo(() => {
    const counts = new Map<string, number>();
    for (const provider of providers) {
      if (!provider.nodeId) continue;
      counts.set(provider.nodeId, (counts.get(provider.nodeId) || 0) + 1);
    }
    return counts;
  }, [providers]);

  const startPairing = async () => {
    if (!address.trim() || busy) return;
    setBusy(true);
    try {
      const challenge = await controller.beginPeerPairing(address.trim());
      if (challenge) setPin('');
    } finally {
      setBusy(false);
    }
  };

  const completePairing = async () => {
    if (!controller.pendingPeer || pin.replace(/\D/g, '').length !== 6 || busy) return;
    setBusy(true);
    try {
      const ok = await controller.finishPeerPairing(pin);
      if (ok) {
        setAddress('');
        setPin('');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="peer-node-studio panel">
      <div className="peer-node-head">
        <div>
          <span className="eyebrow">{t('peerNodes.kicker')}</span>
          <h2>{t('peerNodes.title')}</h2>
          <p>{t('peerNodes.description')}</p>
        </div>
        <div className="peer-node-summary">
          <small>{t('peerNodes.computers')}</small>
          <strong>{1 + peers.length}</strong>
        </div>
      </div>

      <div className="peer-node-grid">
        <article className="peer-node-card local">
          <div className="peer-node-card-head">
            <span className="status-dot" />
            <div>
              <strong>{controller.health?.hostname || t('peerNodes.thisComputer')}</strong>
              <small>{t('peerNodes.primaryNode')}</small>
            </div>
          </div>
          <div className="peer-node-card-meta">
            <span>{t('peerNodes.online')}</span>
            <span>{providersByNode.get(controller.nodeState?.nodeId || '') || 0} {t('peerNodes.providers')}</span>
          </div>
        </article>

        {peers.map(peer => (
          <article key={peer.nodeId} className={`peer-node-card ${peer.health}`}>
            <div className="peer-node-card-head">
              <span className="status-dot" />
              <div>
                <strong>{peer.displayName || peer.nodeId}</strong>
                <small>{peer.health === 'online'
                  ? t('peerNodes.online')
                  : peer.health === 'degraded'
                    ? t('peerNodes.degraded')
                    : t('peerNodes.offline')}</small>
              </div>
            </div>
            <div className="peer-node-card-meta">
              <span>{peer.providersOnline}/{peer.providers} {t('peerNodes.providers')}</span>
              <span>{peer.baseUrl.replace(/^https?:\/\//, '')}</span>
            </div>
            <button
              type="button"
              className="ghost peer-node-remove"
              onClick={() => void controller.forgetPeerNode(peer.nodeId)}
            >
              {t('peerNodes.remove')}
            </button>
          </article>
        ))}
      </div>

      {!controller.pendingPeer ? (
        <div className="peer-node-add">
          <div>
            <strong>{t('peerNodes.addTitle')}</strong>
            <p>{t('peerNodes.addHint')}</p>
          </div>
          <div className="peer-node-add-form">
            <input
              value={address}
              onChange={event => setAddress(event.target.value)}
              placeholder={t('peerNodes.addressPlaceholder')}
              autoComplete="off"
              inputMode="url"
            />
            <button
              type="button"
              className="primary"
              disabled={busy || !address.trim()}
              onClick={() => void startPairing()}
            >
              {busy ? t('peerNodes.connecting') : t('peerNodes.connect')}
            </button>
          </div>
        </div>
      ) : (
        <div className="peer-node-pairing">
          <div>
            <span className="eyebrow">{t('peerNodes.securePairing')}</span>
            <strong>{t('peerNodes.enterRemotePin')}</strong>
            <p>{t('peerNodes.pinHint')}</p>
          </div>
          <div className="peer-node-pin-form">
            <input
              value={pin}
              onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
            />
            <button
              type="button"
              className="primary"
              disabled={busy || pin.length !== 6}
              onClick={() => void completePairing()}
            >
              {busy ? t('peerNodes.connecting') : t('peerNodes.confirm')}
            </button>
          </div>
        </div>
      )}

      {controller.peerErrorCode && (
        <div className="peer-node-error">
          {t(`nodeErrors.${controller.peerErrorCode}`, {
            defaultValue: controller.peerErrorCode
          })}
        </div>
      )}
    </section>
  );
}
