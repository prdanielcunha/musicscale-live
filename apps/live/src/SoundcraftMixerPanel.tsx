import { useCallback, useEffect, useRef, useState } from 'react';
import type { useLiveNode } from './useLiveNode';
import {
  getSoundcraftSiState, writeSoundcraftSiFader, type SoundcraftSiSnapshot
} from './liveNodeClient';
import './AudioMixerPanel.css';

type Controller = ReturnType<typeof useLiveNode>;
function SoundcraftFader({ channel, active, onSelect, onWrite, disabled }: {
  channel: SoundcraftSiSnapshot['channels'][number];
  active: boolean;
  disabled: boolean;
  onSelect: () => void;
  onWrite: (channel: string, value: number) => void;
}) {
  const [draft, setDraft] = useState(0);
  const dragging = useRef(false);
  useEffect(() => {
    if (!dragging.current && channel.fader !== undefined) setDraft(Math.round(channel.fader * 100));
  }, [channel.fader]);
  const submit = (input: HTMLInputElement) => {
    dragging.current = false;
    if (disabled || channel.fader === undefined) return;
    const value = Number(input.value) / 100;
    if (Math.abs(value - channel.fader) < 0.001) return;
    if (Math.abs(value - channel.fader) > 0.10) {
      setDraft(Math.round(channel.fader * 100));
      window.alert('Para segurança do culto, ajuste o volume em passos de até 10%.');
      return;
    }
    onWrite(channel.id, value);
  };
  return (
    <article className={'mx-strip ' + (active ? 'mx-strip-selected' : '')}>
      <button type="button" className="mx-channel-title" onClick={onSelect} aria-pressed={active}>
        <small>{channel.label}</small>
        <strong>{channel.name || 'Entrada ' + Number(channel.id.slice(3))}</strong>
      </button>
      <div className="mx-strip-slider">
        <label className="mx-range">
          <span>Volume <strong>{channel.fader === undefined ? '—' : Math.round(channel.fader * 100) + '%'}</strong></span>
          <input
            aria-label={'Volume ' + channel.label}
            type="range" min={0} max={100} step={1}
            disabled={disabled || channel.fader === undefined}
            value={draft}
            onChange={event => setDraft(Number(event.currentTarget.value))}
            onPointerDown={() => { dragging.current = true; }}
            onPointerUp={event => submit(event.currentTarget)}
            onPointerCancel={() => { dragging.current = false; setDraft(Math.round((channel.fader || 0) * 100)); }}
            onKeyUp={event => {
              if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) submit(event.currentTarget);
            }}
          />
        </label>
      </div>
      <small>{channel.fader === undefined ? 'Aguardando leitura real' : 'Estado observado'}</small>
    </article>
  );
}

export function SoundcraftMixerPanel({ controller }: { controller: Controller }) {
  const [snapshot, setSnapshot] = useState<SoundcraftSiSnapshot | null>(null);
  const [selected, setSelected] = useState('ch/01');
  const [group, setGroup] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const credential = controller.credential;
  const refresh = useCallback(async () => {
    if (!credential) return;
    try {
      const next = await getSoundcraftSiState(credential.baseUrl, credential.token);
      setSnapshot(next);
      setError('');
    } catch (cause) {
      setSnapshot(null);
      setError(cause instanceof Error ? cause.message : 'Não foi possível ler a mesa.');
    }
  }, [credential]);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 2500);
    return () => window.clearInterval(timer);
  }, [refresh]);
  const write = useCallback(async (channel: string, value: number) => {
    if (!credential || !snapshot?.connected || busy) return;
    setBusy(true);
    setMessage('Conferindo alteração na mesa…');
    try {
      const result = await writeSoundcraftSiFader(credential.baseUrl, credential.token, channel, value);
      setMessage(result.confirmed ? 'Volume confirmado pelo sistema de controle.' :
        'Sem confirmação do volume. Confira a mesa fisicamente antes de tentar novamente.');
      await refresh();
    } catch (cause) {
      setMessage('');
      setError(cause instanceof Error ? cause.message : 'Alteração não executada.');
    } finally {
      setBusy(false);
    }
  }, [credential, snapshot?.connected, busy, refresh]);
  const connected = Boolean(snapshot?.connected);
  const channels = snapshot?.channels || [];
  return (
    <section className="mx-console" aria-label="Controle Soundcraft Industrial">
      <header className="mx-head">
        <div>
          <span className="mx-kicker">MUSICSCALE LIVE / INDUSTRIAL</span>
          <h1>Soundcraft Si Expression 3</h1>
          <p>Controle de volume dos canais via Mixing Station Desktop e Live Node</p>
        </div>
        <span role="status" className={'mx-health ' + (connected ? 'online' : 'offline')}>
          <i />{connected ? 'Valores recebidos' : 'Sem confirmação da mesa'}
        </span>
      </header>
      <p className="mx-notice">
        Esta integração exige Mixing Station Desktop conectado por HiQnet à Soundcraft
        (mesa: 192.168.0.148), com OSC habilitado no próprio computador do Live Node.
        Abra <code>http://127.0.0.1:4317/local/audio/soundcraft/setup</code> nesse computador.
      </p>
      {!connected && <p className="mx-notice">Controles bloqueados enquanto não houver leitura real de faders.</p>}
      {error && <p className="mx-error" role="alert">{error}</p>}
      {message && <p className="mx-status" role="status">{message}</p>}
      <div className="mx-toolbar">
        {['Canais 1–8','Canais 9–16','Canais 17–24','Canais 25–32'].map((title, i) => (
          <button type="button" key={title} className={group === i ? 'selected' : ''}
            onClick={() => setGroup(i)}>{title}</button>
        ))}
        <button type="button" className="mx-refresh" onClick={() => void refresh()}>Atualizar</button>
      </div>
      <div className="mx-strips" aria-label="Volumes de entradas" role="region" tabIndex={0}>
        {channels.slice(group * 8, group * 8 + 8).map(channel => (
          <SoundcraftFader key={channel.id} channel={channel} active={selected === channel.id}
            onSelect={() => setSelected(channel.id)} disabled={!connected || busy}
            onWrite={(id, value) => void write(id, value)} />
        ))}
      </div>
      <footer className="mx-foot">
        <strong>Proteção para o culto</strong>
        <span>Somente volume de canais de entrada, com confirmação de estado e alteração limitada a 10% por comando.
        Mute, FX, roteamento, phantom, ganho, scenes e master permanecem bloqueados até validação de protocolo e ensaio real.</span>
        <span>Isso não é controle HiQnet nativo. Sem Mixing Station Desktop, a integração não funciona.</span>
      </footer>
    </section>
  );
}
