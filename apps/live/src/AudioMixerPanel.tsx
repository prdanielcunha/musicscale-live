import { useCallback, useEffect, useRef, useState } from 'react';
import {
  configureX32Mixer, getX32MixerState, setX32MixerParameter,
  getAudioMixerProfile, setAudioMixerProfile, type AudioMixerFamily,
  type X32MixerChannel, type X32MixerParameter,
  type X32MixerSnapshot, type X32MixerWrite
} from './liveNodeClient';
import type { useLiveNode } from './useLiveNode';
import './AudioMixerPanel.css';

/** The paired device is not proof of a particular audio console.
 * Do not mount X32 polling or write controls until the venue explicitly
 * selects Behringer X32. Soundcraft Si audio control remains disabled.
 */
export function AudioMixerPanel({ controller }: { controller: Controller }) {
  const credential = controller.credential;
  const [family, setFamily] = useState<AudioMixerFamily>('none');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    if (!credential) {
      setLoading(false);
      return;
    }
    void getAudioMixerProfile(credential.baseUrl, credential.token)
      .then(profile => {
        if (active) { setFamily(profile.family); setError(''); }
      })
      .catch(cause => {
        if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível identificar a mesa configurada.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [credential?.baseUrl, credential?.token]);

  const chooseFamily = async (next: AudioMixerFamily) => {
    if (!credential || saving) return;
    setSaving(true);
    try {
      const saved = await setAudioMixerProfile(credential.baseUrl, credential.token, next);
      setFamily(saved.family);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a mesa deste local.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <section className="mx-console mx-mixer-selector" aria-label="Configurar mesa de som deste local">
        <header className="mx-head">
          <div>
            <span className="mx-kicker">MUSICSCALE LIVE / ÁUDIO</span>
            <h1>Mesa de Som</h1>
            <p>Identidade da mesa separada por igreja e local. A conexão com o Live Node não detecta automaticamente uma X32.</p>
          </div>
          <span className="mx-health" role="status">
            <i />{loading ? 'Consultando o computador…' : family === 'none' ? 'Modelo não selecionado' : 'Modelo selecionado'}
          </span>
        </header>
        <div className="mx-setup">
          <label>Modelo utilizado neste local
            <select
              aria-label="Modelo da mesa de som"
              value={family}
              disabled={!credential || loading || saving}
              onChange={event => void chooseFamily(event.currentTarget.value as AudioMixerFamily)}
            >
              <option value="none">Selecione uma mesa</option>
              <option value="soundcraft-si-expression">Soundcraft Si Expression (Industrial)</option>
              <option value="behringer-x32">Behringer X32</option>
            </select>
          </label>
          <small>Esta escolha fica salva no computador de produção para o local pareado. Selecionar o modelo não movimenta faders, mute ou ganho.</small>
        </div>
        {error && <p className="mx-error" role="alert">{error}</p>}
        {family === 'none' && !loading && (
          <p className="mx-notice">Escolha o modelo acima. Nenhum controle de áudio é disponibilizado até que uma mesa seja selecionada.</p>
        )}
        {family === 'soundcraft-si-expression' && (
          <div className="mx-detail">
            <div className="mx-detail-head">
              <div>
                <span className="mx-kicker">SOUNDCRAFT / HIQNET</span>
                <h2>Si Expression 3</h2>
              </div>
              <span>Somente identificação</span>
            </div>
            <p className="mx-notice">
              Mesa selecionada para este local. O controle remoto HiQnet ainda exige
              validação física na Soundcraft. Os faders, MUTE, EQ e demais comandos
              permanecem indisponíveis para proteger o áudio do culto.
            </p>
            <p>O Holyrics, o Resolume e a operação normal do computador continuam independentes desta configuração.</p>
          </div>
        )}
      </section>
      {family === 'behringer-x32' && !loading && (
        <X32MixerControls controller={controller} />
      )}
    </>
  );
}


type Controller = ReturnType<typeof useLiveNode>;

function scaled(value: number | undefined) {
  return typeof value === 'number' ? Math.round(value * 100) : 0;
}
function formatPercent(value?: number) {
  return typeof value === 'number' ? Math.round(value * 100) + '%' : '—';
}
function groupName(id: string) {
  if (id.startsWith('ch/')) return 'Entradas';
  if (id.startsWith('auxin/')) return 'Entradas auxiliares';
  if (id.startsWith('fxrtn/')) return 'Retornos de efeito';
  if (id.startsWith('bus/')) return 'Buses';
  return 'Master';
}
function RangeControl({
  label, value, disabled, onCommit, display
}: {
  label: string;
  value?: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
  display?: string;
}) {
  const [draft, setDraft] = useState(() => scaled(value));
  const touching = useRef(false);
  useEffect(() => {
    if (!touching.current && value !== undefined) setDraft(scaled(value));
  }, [value]);
  const commit = (input: HTMLInputElement) => {
    touching.current = false;
    const next = Number(input.value) / 100;
    if (value === undefined || Math.abs(value - next) > 0.0005) onCommit(next);
  };
  return (
    <label className="mx-range">
      <span>{label} <strong>{display || formatPercent(value)}</strong></span>
      <input
        aria-label={label}
        type="range" min="0" max="100" step="1"
        disabled={disabled || value === undefined}
        value={draft}
        onChange={event => setDraft(Number(event.currentTarget.value))}
        onPointerDown={() => { touching.current = true; }}
        onPointerUp={event => commit(event.currentTarget)}
        onPointerCancel={() => { touching.current = false; }}
        onKeyUp={event => {
          if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'].includes(event.key)) {
            commit(event.currentTarget);
          }
        }}
      />
    </label>
  );
}

function Strip({
  channel, active, online, select, change
}: {
  channel: X32MixerChannel;
  active: boolean;
  online: boolean;
  select: () => void;
  change: (command: X32MixerWrite) => void;
}) {
  const isMaster = channel.id === 'main/st';
  const writeFader = (value: number) => {
    if (isMaster && !window.confirm('Alterar o volume principal da mesa?')) return;
    change({ channel: channel.id, parameter: 'fader', value });
  };
  return (
    <article className={'mx-strip ' + (active ? 'mx-strip-selected' : '')}>
      <button type="button" className="mx-channel-title" onClick={select} aria-pressed={active}>
        <small>{channel.label}</small>
        <strong>{channel.name || channel.label}</strong>
      </button>
      <div className="mx-strip-slider">
        <RangeControl label={'Volume de ' + (channel.name || channel.label)}
          value={channel.fader} disabled={!online} onCommit={writeFader}/>
      </div>
      <button type="button"
        className={'mx-mute ' + (channel.on === 0 ? 'is-muted' : '')}
        disabled={!online || channel.on === undefined}
        aria-label={'Silenciar ou ativar ' + channel.label}
        aria-pressed={channel.on === 0}
        onClick={() => { if (isMaster && !window.confirm('Alterar MUTE do Master LR? Isso afeta o som principal.')) return; change({ channel: channel.id, parameter: 'on', value: channel.on === 0 ? 1 : 0 }); }}>
        {channel.on === 0 ? 'MUTADO' : 'MUTE'}
      </button>
    </article>
  );
}

function X32MixerControls({ controller }: { controller: Controller }) {
  const [snapshot, setSnapshot] = useState<X32MixerSnapshot | null>(null);
  const [selected, setSelected] = useState('ch/01');
  const [group, setGroup] = useState('Entradas');
  const [host, setHost] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const credential = controller.credential;
  const localComputer = ['localhost', '127.0.0.1'].includes(window.location.hostname);

  const refresh = useCallback(async () => {
    if (!credential) return;
    try {
      const updated = await getX32MixerState(credential.baseUrl, credential.token, selected);
      setSnapshot(updated);
      setError('');
      if (updated.host) setHost(updated.host);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível ler o estado da mesa.');
    }
  }, [credential, selected]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => { void refresh(); }, 2500);
    return () => window.clearInterval(id);
  }, [refresh]);

  const change = useCallback(async (command: X32MixerWrite) => {
    if (!credential || !snapshot?.connected) return;
    try {
      setMessage('Enviando para a mesa…');
      const result = await setX32MixerParameter(credential.baseUrl, credential.token, command);
      setMessage(result.confirmed
        ? 'Ajuste confirmado pela mesa.'
        : 'Comando enviado, mas sem confirmação da mesa. Confira o controle físico.');
      await refresh();
    } catch (cause) {
      setMessage('');
      setError(cause instanceof Error ? cause.message : 'Comando não enviado.');
    }
  }, [credential, refresh, snapshot?.connected]);

  const configure = async () => {
    setBusy(true);
    try {
      const state = await configureX32Mixer(host);
      setSnapshot(state);
      setMessage('Endereço salvo. Aguardando resposta da X32…');
      setError('');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível configurar a X32.');
    } finally { setBusy(false); }
  };

  const selectedChannel = snapshot?.channels.find(item => item.id === selected);
  const eq = snapshot?.eq || {};
  const isEq = selected.startsWith('ch/') || selected.startsWith('auxin/');
  const write = (parameter: X32MixerParameter, value: number, band?: number, bus?: number) => {
    void change({ channel: selected, parameter, value, band, bus });
  };
  const online = Boolean(snapshot?.connected);

  return (
    <section className="mx-console" aria-label="Mesa de som MusicScale Live">
      <header className="mx-head">
        <div>
          <span className="mx-kicker">MUSICSCALE LIVE / AUDIO</span>
          <h1>Mesa de Som</h1>
          <p>Controle manual da Behringer X32 · Operação local sem internet</p>
        </div>
        <span className={'mx-health ' + (online ? 'online' : 'offline')} role="status">
          <i />{online ? 'Mesa conectada' : snapshot?.host ? 'Aguardando a mesa' : 'Mesa não configurada'}
        </span>
      </header>

      {localComputer && (
        <div className="mx-setup">
          <label>Endereço IP da X32 na rede da mesa
            <input inputMode="decimal" placeholder="192.168.1.100" value={host} onChange={event => setHost(event.target.value)} />
          </label>
          <button type="button" disabled={busy} onClick={() => void configure()}>
            {busy ? 'Conectando…' : 'Conectar X32'}
          </button>
          <small>Configure uma vez no PC com o Live Node. O celular deve estar pareado com esse computador.</small>
        </div>
      )}

      {!snapshot?.host && !localComputer && (
        <p className="mx-notice">Primeiro configure o IP da X32 no computador de produção, em http://127.0.0.1:4317/node. Depois volte aqui pelo celular.</p>
      )}
      {!online && snapshot?.host && (
        <p className="mx-notice">Sem confirmação da mesa em {snapshot.host}. Verifique o Wi-Fi USB do computador, a mesma rede da X32 e a porta UDP 10023.</p>
      )}
      {error && <p className="mx-error" role="alert">{error}</p>}
      {message && <p className="mx-status" role="status">{message}</p>}
      <div className="mx-toolbar">
        {['Entradas', 'Entradas auxiliares', 'Retornos de efeito', 'Buses', 'Master'].map(name => (
          <button type="button" key={name} className={group === name ? 'selected' : ''} onClick={() => setGroup(name)}>
            {name}
          </button>
        ))}
        <button className="mx-refresh" type="button" onClick={() => void refresh()}>Atualizar</button>
      </div>
      <div className="mx-strips" role="region" aria-label={'Canais: ' + group} tabIndex={0}>
        {(snapshot?.channels || []).filter(channel => groupName(channel.id) === group).map(channel => (
          <Strip key={channel.id} channel={channel} active={selected === channel.id} online={online}
            select={() => setSelected(channel.id)} change={command => { void change(command); }} />
        ))}
        {!snapshot && <p>Conecte o Live Node para visualizar os canais.</p>}
      </div>
      {selectedChannel && (
        <section className="mx-detail">
          <div className="mx-detail-head">
            <div><span className="mx-kicker">CANAL SELECIONADO</span>
              <h2>{selectedChannel.name || selectedChannel.label}</h2>
            </div>
            <span>{selectedChannel.label}</span>
          </div>
          <div className="mx-detail-grid">
            {selectedChannel.pan !== undefined && (
              <RangeControl label="Panorama" value={selectedChannel.pan} disabled={!online}
                display={Math.round(((selectedChannel.pan || 0) - 0.5) * 200) + '%'}
                onCommit={value => write('pan', value)}/>
            )}
            {isEq && (
              <>
                <div className="mx-eq-toggle">
                  <span>Equalizador</span>
                  <button disabled={!online || eq['eq/on'] === undefined}
                    className={eq['eq/on'] === 1 ? 'selected' : ''}
                    onClick={() => write('eqOn', eq['eq/on'] === 1 ? 0 : 1)}>
                    {eq['eq/on'] === 1 ? 'Ligado' : 'Desligado'}
                  </button>
                </div>
                {[1,2,3,4].map(band => (
                  <div className="mx-eq-band" key={band}>
                    <strong>Banda {band}</strong>
                    <RangeControl label="Frequência" value={eq['eq/' + band + '/f']} disabled={!online}
                      display={eq['eq/' + band + '/f'] === undefined ? '—' :
                        Math.round(20 * Math.pow(1000, eq['eq/' + band + '/f'] ?? 0)) + ' Hz'}
                      onCommit={value => write('eqFrequency', value, band)}/>
                    <RangeControl label="Ganho" value={eq['eq/' + band + '/g']} disabled={!online}
                      display={eq['eq/' + band + '/g'] === undefined ? '—' :
                        (((eq['eq/' + band + '/g'] ?? 0.5) - 0.5) * 30).toFixed(1) + ' dB'}
                      onCommit={value => write('eqGain', value, band)}/>
                    <RangeControl label="Q" value={eq['eq/' + band + '/q']} disabled={!online}
                      onCommit={value => write('eqQ', value, band)}/>
                  </div>
                ))}
              </>
            )}
          </div>
          {isEq && (
            <div className="mx-buses">
              <h3>Envios para auxiliares e buses</h3>
              <div className="mx-bus-grid">
                {Array.from({ length: 16 }, (_, i) => i + 1).map(bus => (
                  <RangeControl key={bus} label={'Bus ' + String(bus).padStart(2,'0')}
                    value={eq['mix/' + String(bus).padStart(2,'0') + '/level']}
                    disabled={!online} onCommit={value => write('sendLevel', value, undefined, bus)} />
                ))}
              </div>
            </div>
          )}
        </section>
      )}
      <footer className="mx-foot">
        <strong>Segurança de operação</strong>
        <span>Nenhuma ação automática por IA. Ganho de pré-amplificador, phantom 48V e recall de cenas não são liberados nesta versão beta.</span>
      </footer>
    </section>
  );
}
