import { useEffect, useState } from 'react';
import { getSoundcraftNativeState, type SoundcraftNativeNodeState } from './liveNodeClient';
import type { useLiveNode } from './useLiveNode';
import './AudioMixerPanel.css';

type Controller = ReturnType<typeof useLiveNode>;

/** Honest operator surface: never render fake faders from an unverified mixer. */
export function SoundcraftNativePanel({ controller }: { controller: Controller }) {
  const [state, setState] = useState<SoundcraftNativeNodeState | null>(null);
  const [error, setError] = useState('');
  const credential = controller.credential;
  useEffect(() => {
    if (!credential) return;
    let active = true;
    const poll = async () => {
      try {
        const result = await getSoundcraftNativeState(credential.baseUrl, credential.token);
        if (active) { setState(result); setError(''); }
      } catch (cause) {
        if (active) {
          setState(null);
          setError(cause instanceof Error ? cause.message : 'Sem comunicação com o Live Node.');
        }
      }
    };
    void poll();
    const interval = window.setInterval(() => { void poll(); }, 5000);
    return () => { active = false; window.clearInterval(interval); };
  }, [credential]);
  return (
    <section className="mx-console" aria-label="Soundcraft Industrial">
      <header className="mx-head">
        <div>
          <span className="mx-kicker">MUSICSCALE LIVE / LONDRINA</span>
          <h1>Soundcraft Si Expression 3</h1>
          <p>Rede SOM dedicada · HiQnet nativo · Sem aplicativo intermediário pago</p>
        </div>
        <span className="mx-health offline" role="status">
          <i />{state?.probe?.reachable ? 'Mesa descoberta, controle pendente' : 'Aguardando diagnóstico'}
        </span>
      </header>
      {error && <p role="alert" className="mx-error">{error}</p>}
      <div className="mx-detail">
        <div className="mx-detail-grid">
          <p><strong>Mesa</strong><br />192.168.0.148</p>
          <p><strong>Wi-Fi SOM do computador</strong><br />192.168.0.158</p>
          <p><strong>HiQnet</strong><br />10596 · porta 3804</p>
          <p><strong>Internet</strong><br />Ethernet OBPC (rede independente)</p>
        </div>
        <p className="mx-status" role="status">
          {state?.probe?.explanation ||
            'No computador de produção, abra o diagnóstico local para testar a rede SOM.'}
        </p>
        <p>
          Abra <code>http://127.0.0.1:4317/local/audio/soundcraft/probe</code> no navegador
          do computador de produção para fazer uma verificação única, sem alterar o áudio.
        </p>
      </div>
      <footer className="mx-foot">
        <strong>Segurança do culto</strong>
        <span>Esta etapa testa a descoberta HiQnet. Volume, mute e demais controles continuam
          bloqueados enquanto os valores reais não forem comprovados no hardware.
          Nenhuma licença paga ou ponte de rede é necessária.</span>
        <span>Para o controle dos faders, ainda falta validar sessão e leitura dos parâmetros
          com o firmware 1.8 da mesa.</span>
      </footer>
    </section>
  );
}
