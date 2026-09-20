import { useEffect, useMemo, useState } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { useTranslation } from 'react-i18next';
import { auth } from './firebase';
import { LiveControlPanel } from './LiveControlPanel';
import { LocalRecoveryView } from './LocalRecoveryView';
import { LiveNodeSetup } from './LiveNodeSetup';
import { liveFeatureFlags } from './featureFlags';
import { loadNextScale, loadSharedContext, subscribeNextScale, type SharedContext, type SharedScale } from './musicScaleBridge';
import { ScalePreflight } from './ScalePreflight';
import { SystemTopologyPanel } from './SystemTopologyPanel';
import { SignalTopologyStudio } from './SignalTopologyStudio';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { PeerNodeStudio } from './PeerNodeStudio';
import { VisualControlPanel } from './VisualControlPanel';
import { LiveCueCoordinatorProvider } from './LiveCueCoordinator';
import { detectSameOriginLiveNode } from './liveNodeClient';
import { markLiveMetric } from './telemetry';
import { useLiveNode } from './useLiveNode';
import { useLiveFocus } from './useLiveFocus';
import { useOperatorViewport } from './useOperatorViewport';
import { RequestSurface } from './RequestSurface';
import { LiveRequestInbox } from './LiveRequestInbox';
import { SceneStudio } from './SceneStudio';
import { LiveSceneBar } from './LiveSceneBar';
import { PlaylistSyncAutomation } from './PlaylistSyncAutomation';
import { LiveDropPanel } from './LiveDropPanel';
import { UniversalMediaLibrary } from './UniversalMediaLibrary';

type Surface = 'live' | 'studio' | 'pastor' | 'conductor';
type LiveSessionMode = 'service' | 'free';
type StudioSection =
  | 'overview'
  | 'prepare'
  | 'library'
  | 'computers'
  | 'routing'
  | 'signal'
  | 'scenes'
  | 'diagnostics';

export function App() {
  const { t, i18n } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [context, setContext] = useState<SharedContext | null>(null);
  const [scale, setScale] = useState<SharedScale | null>(null);
  const [loading, setLoading] = useState(true);
  const [localNodeOrigin, setLocalNodeOrigin] = useState(false);
  const [localNodeDetectionDone, setLocalNodeDetectionDone] = useState(false);
  const [surface, setSurface] = useState<Surface>('studio');
  const [studioSection, setStudioSection] = useState<StudioSection>('overview');
  const [liveMode, setLiveMode] = useState<LiveSessionMode>('service');
  const [freeSessionId] = useState(() => crypto.randomUUID());
  const liveNode = useLiveNode();
  const liveFocus = useLiveFocus(surface === 'live');
  const operatorViewport = useOperatorViewport(surface === 'live');

  useEffect(() => {
    let cancelled = false;
    detectSameOriginLiveNode().then(isLocal => {
      if (!cancelled) {
        setLocalNodeOrigin(isLocal);
        setLocalNodeDetectionDone(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    markLiveMetric('shell-mounted');
    return onAuthStateChanged(auth, async currentUser => {
      setUser(currentUser);
      setContext(null);
      setScale(null);
      setLiveMode('service');
      setStudioSection('overview');

      if (!currentUser) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const nextContext = await loadSharedContext(currentUser);
        setContext(nextContext);
        if (nextContext) setScale(await loadNextScale(nextContext.organizationId));
      } finally {
        setLoading(false);
        markLiveMetric('shared-context-ready');
      }
    });
  }, []);

  useEffect(() => {
    if (!context?.organizationId) return;
    return subscribeNextScale(
      context.organizationId,
      nextScale => setScale(nextScale),
      () => undefined
    );
  }, [context?.organizationId]);

  const nodeStatus = useMemo(() => {
    if (liveNode.state === 'connected') return t('connected');
    if (liveNode.state === 'probing' || liveNode.state === 'pairing') return t('nodeStatus.connecting');
    if (liveNode.state === 'degraded' || liveNode.state === 'reconnecting') return t('nodeStatus.reconnecting');
    if (liveNode.state === 'offline' || liveNode.state === 'blocked') return t('nodeStatus.offline');
    return t('pending');
  }, [liveNode.state, t]);

  const login = () => signInWithPopup(auth, new GoogleAuthProvider());
  const logout = () => signOut(auth);

  if (loading || (!user && !localNodeDetectionDone)) {
    return <main className="center"><div className="boot-orb" /><p>{t('loading')}</p></main>;
  }

  if (!user && localNodeOrigin) {
    return <LocalRecoveryView controller={liveNode} />;
  }

  if (!user) {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <div className="brand-kicker">MILLIONSNEST / LIVE</div>
          <h1>MillionsNest <strong>LIVE</strong></h1>
          <p>{t('sameEcosystem')}</p>
          <button className="primary" onClick={login}>{t('signIn')}</button>
        </section>
      </main>
    );
  }

  const nodeConnected = liveNode.state === 'connected';
  const providersConnected = (liveNode.health?.providersOnline ?? 0) > 0;
  const effectiveLiveMode: LiveSessionMode =
    liveMode === 'service' && scale ? 'service' : 'free';
  const liveSessionId =
    effectiveLiveMode === 'service' && scale
      ? `music-scale:${scale.id}`
      : `ad-hoc:${context?.organizationId || user.uid}:${freeSessionId}`;

  const studioSections: Array<{
    key: StudioSection;
    requiresNode?: boolean;
    requiresScale?: boolean;
  }> = [
    { key: 'overview' },
    { key: 'prepare', requiresNode: true },
    { key: 'library', requiresNode: true },
    { key: 'computers', requiresNode: true },
    { key: 'routing', requiresNode: true },
    { key: 'signal', requiresNode: true },
    { key: 'scenes', requiresNode: true },
    { key: 'diagnostics', requiresNode: true }
  ];

  return (
    <div className={[
      'app-shell',
      surface === 'live' ? 'live-surface' : '',
      liveFocus.fullscreen ? 'live-focus-mode' : '',
      ...operatorViewport.classes
    ].filter(Boolean).join(' ')}>
      <header className="topbar">
        <div>
          <div className="brand-kicker">MILLIONSNEST / LIVE</div>
          <strong>{t('brand')}</strong>
        </div>
        <div className="top-actions">
          <select value={i18n.resolvedLanguage || 'pt'} onChange={e => i18n.changeLanguage(e.target.value)}>
            <option value="pt">PT</option><option value="en">EN</option><option value="es">ES</option>
          </select>
          <button className="ghost" onClick={logout}>{t('signOut')}</button>
        </div>
      </header>

      <aside className="sidebar">
        {(['studio','live','pastor','conductor'] as Surface[]).map(item => (
          <button key={item} onClick={() => setSurface(item)} className={surface === item ? 'active' : ''}>
            {t(item)}
          </button>
        ))}
      </aside>

      <main className="workspace">
        {surface === 'live' ? (
          <section className="live-session-strip">
            <div className="live-session-identity">
              <span className="live-session-dot" />
              <div>
                <small>{t('liveWorkspace.onAir')}</small>
                <strong>
                  {effectiveLiveMode === 'service'
                    ? scale?.eventName || t('liveWorkspace.preparedService')
                    : t('liveWorkspace.adHoc')}
                </strong>
                <span>
                  {context?.organizationName || t('organization')}
                  {effectiveLiveMode === 'service' && scale?.time ? ` · ${scale.time}` : ''}
                  {effectiveLiveMode === 'service' && scale?.locationName ? ` · ${scale.locationName}` : ''}
                  {effectiveLiveMode === 'free' ? ` · ${t('liveWorkspace.freeModeHint')}` : ''}
                </span>
              </div>
            </div>
            <div className="live-session-mode" role="group" aria-label={t('liveWorkspace.modeLabel')}>
              <button
                type="button"
                className={effectiveLiveMode === 'service' ? 'active' : ''}
                disabled={!scale}
                onClick={() => setLiveMode('service')}
              >
                <small>{t('liveWorkspace.prepared')}</small>
                <strong>{t('liveWorkspace.serviceMode')}</strong>
              </button>
              <button
                type="button"
                className={effectiveLiveMode === 'free' ? 'active' : ''}
                onClick={() => setLiveMode('free')}
              >
                <small>{t('liveWorkspace.noPlan')}</small>
                <strong>{t('liveWorkspace.freeMode')}</strong>
              </button>
            </div>
            <div className="live-session-health">
              <span className={nodeConnected ? 'ok' : 'warn'}>
                <b />{t('node')} · {nodeStatus}
              </span>
              <span className={providersConnected ? 'ok' : 'warn'}>
                <b />{t('providers')} · {providersConnected ? `${liveNode.health?.providersOnline ?? 0}/${liveNode.health?.providers ?? 0}` : t('pending')}
              </span>
              <span className="ok">
                <b />{t('liveWorkspace.lanPath')}
              </span>
              {liveFocus.wakeSupported && (
                <span className={liveFocus.wakeActive ? 'ok' : 'warn'}>
                  <b />{liveFocus.wakeActive
                    ? t('liveWorkspace.screenAwake')
                    : t('liveWorkspace.wakeUnavailable')}
                </span>
              )}
              <button
                className="live-focus-button"
                type="button"
                onClick={() => void liveFocus.toggleFullscreen()}
              >
                {liveFocus.fullscreen
                  ? t('liveWorkspace.exitFullscreen')
                  : t('liveWorkspace.fullscreen')}
              </button>
              <button
                className="operator-exit-button"
                type="button"
                onClick={() => setSurface('studio')}
              >
                {t('liveWorkspace.exitOperator')}
              </button>
            </div>
          </section>
        ) : (
          <>
            <section className="hero">
              <div>
                <span className="eyebrow">{t('foundation')} · 0.1.0-alpha.1</span>
                <h1>{surface === 'studio' ? 'Live Studio' : t(surface)}</h1>
                <p>{context?.organizationName || t('organization')}</p>
              </div>
              <div className="pill-row">
                <span>{t('lanFirst')}</span><span>{t('providerAgnostic')}</span><span>{t('offlineReady')}</span>
              </div>
            </section>

            <section className="health-grid">
              <article><span className="status ok" /><div><small>{t('cloud')}</small><strong>{t('connected')}</strong></div></article>
              <article>
                <span className={`status ${nodeConnected ? 'ok' : liveNode.state === 'offline' || liveNode.state === 'blocked' ? 'danger' : 'warn'}`} />
                <div><small>{t('node')}</small><strong>{nodeStatus}</strong></div>
              </article>
              <article>
                <span className={`status ${providersConnected ? 'ok' : 'warn'}`} />
                <div><small>{t('providers')}</small><strong>{providersConnected ? `${liveNode.health?.providersOnline ?? 0}/${liveNode.health?.providers ?? 0}` : t('pending')}</strong></div>
              </article>
            </section>

            {surface === 'studio' && (
              <nav className="studio-section-nav" aria-label={t('studioNavigation.ariaLabel')}>
                {studioSections.map(section => {
                  const disabled =
                    (section.requiresNode && !nodeConnected) ||
                    (section.requiresScale && !scale);
                  return (
                    <button
                      key={section.key}
                      type="button"
                      className={studioSection === section.key ? 'active' : ''}
                      disabled={disabled}
                      onClick={() => setStudioSection(section.key)}
                    >
                      <span>{t(`studioNavigation.sections.${section.key}`)}</span>
                      {section.key === 'diagnostics' && nodeConnected && (
                        <b className={providersConnected ? 'ok' : 'warn'} />
                      )}
                      {section.key === 'prepare' && scale && (
                        <em>{scale.songs.length}</em>
                      )}
                    </button>
                  );
                })}
              </nav>
            )}
          </>
        )}

        {surface === 'live' && operatorViewport.showLandscapeHint && (
          <section className="operator-rotate-hint" role="status">
            <div className="operator-rotate-mark" aria-hidden="true">↻</div>
            <div>
              <strong>{t('liveWorkspace.rotateTitle')}</strong>
              <span>{t('liveWorkspace.rotateHint')}</span>
            </div>
            <button type="button" onClick={operatorViewport.dismissLandscapeHint}>
              {t('liveWorkspace.gotIt')}
            </button>
          </section>
        )}

        {liveNode.state === 'connected' && scale && (
          <PlaylistSyncAutomation
            controller={liveNode}
            scale={scale}
            actorId={user.uid}
          />
        )}

        {surface === 'studio' && studioSection === 'overview' && context && liveFeatureFlags.liveNodeTransport && (
          <LiveNodeSetup controller={liveNode} organizationId={context.organizationId} />
        )}

        {surface === 'studio' && studioSection === 'computers' && liveNode.state === 'connected' && (
          <PeerNodeStudio controller={liveNode} />
        )}

        {surface === 'studio' && studioSection === 'routing' && liveNode.state === 'connected' && (
          <SystemTopologyPanel controller={liveNode} />
        )}

        {surface === 'studio' && studioSection === 'signal' && liveNode.state === 'connected' && (
          <SignalTopologyStudio controller={liveNode} />
        )}

        {surface === 'studio' && studioSection === 'diagnostics' && liveNode.state === 'connected' && (
          <DiagnosticsPanel controller={liveNode} />
        )}

        {surface === 'studio' && studioSection === 'library' && liveNode.state === 'connected' && (
          <UniversalMediaLibrary
            controller={liveNode}
            actorId={user.uid}
            liveSessionId={liveSessionId}
          />
        )}

        {surface === 'studio' && studioSection === 'prepare' && liveNode.state === 'connected' && (
          <LiveDropPanel
            controller={liveNode}
            actorId={user.uid}
            liveSessionId={liveSessionId}
          />
        )}

        {surface === 'studio' && studioSection === 'prepare' && liveNode.state === 'connected' && scale && (
          <ScalePreflight controller={liveNode} scale={scale} actorId={user.uid} />
        )}

        {surface === 'studio' && studioSection === 'scenes' && liveNode.state === 'connected' && (
          <SceneStudio controller={liveNode} actorId={user.uid} />
        )}

        {surface === 'live' && liveNode.state === 'connected' && (
          <LiveCueCoordinatorProvider key={liveSessionId}>
            <LiveControlPanel
              controller={liveNode}
              actorId={user.uid}
              liveSessionId={liveSessionId}
              servicePlanEnabled={effectiveLiveMode === 'service'}
              touchPrimary={operatorViewport.touchCapable}
            />
            <LiveSceneBar
              controller={liveNode}
              actorId={user.uid}
              liveSessionId={liveSessionId}
            />
            <VisualControlPanel
              controller={liveNode}
              actorId={user.uid}
              liveSessionId={liveSessionId}
            />
            <LiveRequestInbox
              controller={liveNode}
              actorId={user.uid}
              liveSessionId={liveSessionId}
            />
          </LiveCueCoordinatorProvider>
        )}

        {(surface === 'pastor' || surface === 'conductor') && liveNode.state === 'connected' && (
          <RequestSurface
            controller={liveNode}
            actorId={user.uid}
            liveSessionId={liveSessionId}
            mode={surface}
          />
        )}

        {(surface === 'pastor' || surface === 'conductor') && liveNode.state !== 'connected' && (
          <section className="panel request-node-required">
            <strong>{t('requestsSurface.nodeRequiredTitle')}</strong>
            <p>{t('requestsSurface.nodeRequiredDescription')}</p>
          </section>
        )}

        {surface === 'studio' && studioSection === 'overview' && <section className="content-grid">
          <article className="panel next-service">
            <div className="panel-head"><span>{t('nextService')}</span><small>{t('readOnlyBridge')}</small></div>
            {scale ? (
              <>
                <div className="service-title">
                  <div>
                    <strong>{scale.eventName || 'Culto'}</strong>
                    <span>{scale.date}{scale.time ? ` · ${scale.time}` : ''}{scale.locationName ? ` · ${scale.locationName}` : ''}</span>
                  </div>
                  <em>{scale.songs.length} {t('songs')}</em>
                </div>
                <div className="song-list">
                  {scale.songs.map((song, index) => <div key={song.id}><b>{String(index + 1).padStart(2,'0')}</b><span>{song.title}<small>{song.artist || ''}</small></span></div>)}
                </div>
              </>
            ) : <p className="muted">{t('noService')}</p>}
          </article>

          <article className="panel live-preview">
            <div className="preview-screen">
              <span>PROGRAM</span>
              <strong>LIVE GRAPH</strong>
              <small>{surface === 'studio' ? 'Nodes · Providers · Routes · Outputs' : 'Preview / Program / Take'}</small>
            </div>
            <nav className="quick-nav">
              <button>{t('now')}</button><button>{t('timeline')}</button><button>{t('bible')}</button><button>{t('media')}</button><button>{t('requests')}</button>
            </nav>
          </article>
        </section>}
      </main>
    </div>
  );
}
