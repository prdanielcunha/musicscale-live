# MusicScale Live

Implementação executável do **MusicScale Live**, derivada do Blueprint Mestre v0.1.

Este é o repositório canônico e independente do MusicScale Live. O produto continua compartilhando identidade, organização, escalas, repertório, permissões e assinatura com o ecossistema MillionsNest/MusicScale, mas possui bundle, deploy, runtime local e ciclo de engenharia próprios.

> Estado atual: fundação técnica em desenvolvimento ativo. O repositório é público, mas os packages permanecem `private: true` para impedir publicação acidental no npm. Repositório público não implica licença de redistribuição; uma licença explícita será definida separadamente.

## Princípios congelados

- LAN-first, cloud-synced e offline-capable.
- Provider-agnostic: Holyrics, ProPresenter e Resolume são adapters, nunca o domínio.
- Control Plane separado do Media Plane.
- PWA Live/Studio + MusicScale Live Node.
- PT/EN/ES desde o início.
- Segurança fail-closed, tenant-scoped e comandos idempotentes.
- Mesmo Firebase/Auth/Firestore canônico do MusicScale/MillionsNest.
- Nenhum componente Live pode virar ponto único de falha do culto.

## Estrutura

- `apps/live`: PWA React/Vite com Studio, Live e modo Local Recovery.
- `packages/domain`: contratos neutros, capabilities, commands, ProviderLink e ServicePlan.
- `packages/live-node`: serviço local, pairing, cache offline, provider runtime e console local.
- `packages/adapters-holyrics`: adapter profundo do Holyrics.
- `packages/adapters-resolume`: adapter visual do Resolume Arena.
- `packages/adapters-propresenter`: adapter de apresentação do ProPresenter.
- `packages/firestore-rules-test`: testes de contrato das futuras coleções Live.
- `distribution`: instaladores/bootstrap alpha para Windows e macOS.
- `docs`: arquitetura, threat model, UX e gates de implantação.

## Rodar em desenvolvimento

Requisitos atuais:

- Node.js 22+ para desenvolvimento/CI.
- Node.js 24 para gerar o executável SEA do Live Node, conforme o target atual de empacotamento.

```bash
npm run setup
npm run typecheck
npm test
npm run build
npm run dev:live
npm run dev:node
```

## Primeiro setup do Live Node

1. Inicie o Live Node no computador de produção.
2. Abra `http://127.0.0.1:4317/node` nesse computador.
3. Configure o provider local desejado (Holyrics, Resolume Arena ou ProPresenter) usando apenas endpoints da LAN/loopback.
4. Use o QR exibido no console para abrir o MusicScale Live em um tablet/celular da mesma LAN.
5. Faça o pareamento com o PIN temporário exibido apenas no computador do Node.
6. No Studio conectado à nuvem, execute o preflight da próxima escala. Correspondências seguras são vinculadas automaticamente; ambiguidades exigem escolha humana.
7. Quando o preflight fica resolvido, o ServicePlan + ProviderLinks são armazenados no Node. O modo Local Recovery passa a operar o culto mesmo sem Firebase/internet.

Credenciais de providers nunca são enviadas ao browser ou à nuvem. A configuração local permanece no Node; migração para credential vault nativo do sistema operacional continua como hardening obrigatório antes de release estável.

## Compatibilidade com MusicScale

O bridge usa os dados canônicos atuais de usuários, organizações, escalas e músicas do projeto `millionsnest`. Também respeita `songSettings` de cada escala (tom/BPM selecionados), mantendo IDs de música estáveis.

As credenciais/configurações web do Firebase presentes no client não são tratadas como segredo — elas são inerentemente públicas em qualquer aplicação web. A segurança deve continuar sendo garantida por Auth, RBAC, Firestore Rules, App Check/policies aplicáveis e autorização server-side. Chaves privadas, service accounts, tokens de providers e credenciais operacionais nunca devem ser commitados.

## Estado dos gates

- **Phase 0 — Foundation:** base de engenharia concluída; repositório dedicado agora criado e canônico. Restam gates externos de Hosting dedicado, RBAC cloud final, Rules/emulator e QA em dispositivos reais.
- **Phase 1 — LAN / Offline:** caminho local implementado em código; falta certificação física Windows/macOS + iPad/Android e teste real de queda de internet.
- **Phase 2 — Holyrics:** adapter profundo implementado em código; falta matriz em instalação Holyrics real.
- **Resolume Arena / ProPresenter:** adapters já existem e seguem o mesmo domínio neutro; continuam sujeitos aos respectivos gates de hardware/API.
- **Próximo marco:** primeiro culto E2E físico com `MusicScale → ServicePlan → Node → provider → observed state`, sem internet como condição de teste.

## Segurança

Como o repositório é público:

- não commitamos `.env`, private keys, service accounts, tokens ou credenciais de providers;
- endpoints locais são tratados como rede privada e passam por policy;
- provider secrets ficam no Node;
- comandos críticos continuam determinísticos, autenticados, idempotentes e auditáveis;
- denúncias de vulnerabilidade devem ser feitas de forma privada, não em issue pública.
