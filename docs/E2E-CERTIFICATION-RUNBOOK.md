# MusicScale Live — E2E LAN / Offline Certification Runbook

Este runbook transforma os gates do Blueprint v0.1 em uma prova física reproduzível. Ele não substitui testes automatizados: certifica aquilo que CI não consegue provar — rede real, hardware real, providers reais, toque em tablet e queda de internet.

> Regra de segurança: durante a certificação, o software original (Holyrics, Resolume Arena ou ProPresenter) deve permanecer operável manualmente. MusicScale Live nunca pode ser o único caminho para manter o culto funcionando.

## 1. Evidências obrigatórias

Para cada execução, registrar:
- data/hora e responsável;
- modelo/OS de cada computador e tablet;
- conexão Wi‑Fi/Ethernet de cada equipamento;
- versão do Live Node e commit testado;
- versão do Holyrics / Resolume / ProPresenter;
- topologia física;
- provider routes configuradas;
- resultado de cada cenário;
- latência percebida/medida;
- qualquer reconnect, warning ou divergence;
- export diagnóstico do Node quando houver falha.

Não incluir tokens, senhas ou credenciais no relatório.

### Relatório automático do Node

No computador do Live Node, o console local oferece **Relatório de certificação**. O JSON registra somente evidências que o software consegue medir com segurança: versão/Node, ServicePlan em cache, ProviderLinks, providers operacionais, rotas, eventos/erros e baseline de latência dos comandos aos providers.

O arquivo **não declara PASS físico automaticamente**. Ele lista explicitamente as evidências que continuam dependendo de teste humano/hardware: matriz de dispositivos, corte de Internet preservando a LAN, versões reais dos providers, saída final, latência completa comando → estado observado, confiança da assinatura do instalador e teste com voluntário. Anexe esse JSON ao resultado preenchido deste runbook.

## 2. Pré-flight comum

Antes de cada cenário:

1. Iniciar todos os providers.
2. Iniciar o MusicScale Live Node em cada computador necessário.
3. Abrir o console local do Node em `http://127.0.0.1:4317/node`.
4. Confirmar que provider configurado aparece como conectado.
5. Abrir MusicScale Live no tablet.
6. Parear via QR/PIN.
7. Abrir a escala real de teste.
8. Executar o preflight.
9. Resolver mappings ambíguos manualmente.
10. Confirmar ServicePlan armazenado localmente.
11. Confirmar **Who controls what** / routes.
12. Garantir que nenhuma rota crítica está ambígua.
13. Manter o provider original aberto para fallback manual.

## 3. Cenário A — Igreja simples

Topologia:

`Tablet → Live Node + Holyrics no mesmo PC → telão`

### Fluxo

- abrir música da escala;
- preparar música;
- TAKE;
- Next/Previous;
- goto slide quando disponível;
- Bíblia por referência;
- intervalo de versos quando suportado;
- clear;
- Black/Blank/Wallpaper/Normal conforme capabilities;
- mensagem de stage quando disponível.

### Aceite

- operador não precisa tocar no PC para o fluxo principal;
- Program reflete estado observado do Holyrics;
- controles ausentes não aparecem;
- ação inválida não derruba a sessão;
- fallback manual no Holyrics continua disponível.

## 4. Cenário B — Topologia Holyrics + Resolume Arena

Topologia prioritária de certificação:

`Tablet → Live Node A → Holyrics PC`

`Tablet → Live Node B → Resolume Arena PC → LED/telão`

O sinal visual continua usando o media plane já adotado pela igreja (NDI/captura/etc.). O MusicScale Live coordena control plane; não transporta o vídeo pela cloud.

### Setup

- route `presentation` → Holyrics;
- route `songs` / `bible` → Holyrics;
- route `visual` → Resolume;
- confirmar health independente dos dois providers.

### Fluxo principal

1. Abrir uma música do ServicePlan.
2. Preparar o próximo item.
3. Armar um visual do Resolume.
4. Executar **TAKE vinculado**.
5. Verificar:
   - Holyrics avançou/apresentou o conteúdo esperado;
   - Arena disparou o clip esperado;
   - Live reportou completed ou partial de forma verdadeira;
   - Program/observed state atualizou sem refresh manual.
6. Repetir com:
   - Next de slide;
   - nova música;
   - Bíblia;
   - visual sem troca de música;
   - troca manual feita diretamente no Arena.

### State reconciliation

Enquanto o Live está aberto:
- mudar manualmente um estado no Arena;
- verificar que observed state/health converge para a realidade;
- o Live não deve insistir silenciosamente em um estado antigo.

### Falha isolada

- encerrar Arena;
- confirmar route visual como degraded/offline;
- continuar controlando Holyrics;
- nenhuma ação de apresentação deve falhar apenas porque Arena caiu;
- reiniciar Arena;
- confirmar reconnect e re-observação.

### Aceite

- Holyrics e Arena podem estar em PCs diferentes;
- TAKE vinculado não esconde falha parcial;
- queda do Arena não derruba Holyrics;
- operador enxerga qual parte da cadeia está degradada.

## 5. Cenário C — ProPresenter-only

Topologia:

`Tablet → Live Node → ProPresenter → Main/Stage`

### Fluxo

- probe/version;
- current/next;
- next/previous/goto cue;
- clear de slide;
- stage message show/hide;
- macro segura;
- preview quando disponível;
- restart do ProPresenter com Live aberto.

### Aceite

- mesma UX NOW/NEXT/TAKE funciona sem Holyrics instalado;
- nenhum botão depende de uma capability ausente;
- restart provoca degraded/reconnecting e recuperação, não estado falso.

## 6. Teste obrigatório — internet desligada

Este teste deve ser feito somente **depois** do ServicePlan/preflight estar preparado no Node.

Importante: derrubar Internet/WAN sem derrubar a LAN local.

### Procedimento

1. Confirmar sessão funcional online.
2. Cortar acesso à Internet.
3. Manter Wi‑Fi/LAN entre tablet, Nodes e providers.
4. Executar pelo menos:
   - Next/Previous;
   - TAKE de música já resolvida;
   - Bíblia local/provider;
   - Scene local;
   - TAKE vinculado Holyrics + Arena, se aplicável.
5. Fechar/reabrir a PWA pelo caminho Local Recovery se necessário.
6. Verificar que cloud/remote features degradam explicitamente.
7. Restaurar Internet.
8. Verificar reconciliação sem duplicar comandos já executados.

### Aceite

A sessão preparada continua operável pela LAN. Perder Firebase/Internet não interrompe o caminho crítico local.

## 7. Teste obrigatório — restart do Live Node

1. Com sessão preparada, anotar Program e ServiceItem ativo.
2. Encerrar o Node.
3. Confirmar que providers continuam operáveis manualmente.
4. Reiniciar Node.
5. Reabrir/reconectar tablet.
6. Verificar:
   - auto-start/rejoin;
   - ServicePlan preservado;
   - active item coerente;
   - observed state re-hidratado;
   - nenhum comando é repetido automaticamente.

## 8. Latência

Executar uma amostra de pelo menos 20 ações locais em LAN saudável.

Medir quando possível:
- UI feedback de Next/Previous;
- comando → ACK do Node;
- Node → provider command sent;
- TAKE vinculado;
- reconnect após restart.

Targets iniciais do produto:
- UI feedback: < 100 ms visualmente;
- ação local → ACK do Node: p95 < 150 ms;
- ação local → provider command sent: p95 < 250 ms, excluindo latência própria do provider.

Se o target falhar, registrar topologia, Wi‑Fi/Ethernet, hardware e provider. Não mascarar o resultado aumentando o target sem investigação.

## 9. Teste de voluntário

Entregar o tablet a uma pessoa que não participou da configuração.

Pedir apenas:
- iniciar/entrar no culto preparado;
- avançar letra;
- voltar;
- preparar Bíblia;
- TAKE;
- entender um warning de provider;
- usar SAFE/Clear conforme instrução.

### Aceite

O usuário executa o fluxo normal sem entrar no Studio, sem lidar com IP/porta/token/layer/driver e sem precisar entender a topologia técnica.

## 10. Critério para declarar o primeiro E2E aprovado

O primeiro marco E2E só é aprovado quando:

- cenário simples passa;
- cenário Holyrics + Arena em PCs diferentes passa;
- internet-cut passa;
- restart do Node passa;
- falha isolada do Arena passa;
- fallback manual permanece;
- diagnósticos não expõem secrets;
- nenhuma ação crítica ocorre por automação invisível;
- resultados e versões ficam registrados no template de certificação.

Depois disso, o próximo gate é repetir a disciplina com ProPresenter-only e ampliar a matriz, sem mudar o domínio neutro para acomodar um provider específico.
