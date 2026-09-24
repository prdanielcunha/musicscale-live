# MusicScale Live Node — instalação alpha

Este pacote contém o **MusicScale Live Node** e a interface local usada para conectar os computadores de produção ao MusicScale Live.

> **Regra do produto:** o fluxo comercial normal não exige Git, PowerShell/Terminal, descoberta de IP, digitação de porta ou configuração do roteador. Os caminhos técnicos continuam apenas como fallback de desenvolvimento/recuperação enquanto a distribuição ainda está em alpha.

## Windows — fluxo normal

1. Dê dois cliques em `MusicScaleLiveSetup.exe`.
2. Confirme a instalação quando o Windows solicitar permissão.
3. O instalador registra o Live Node para iniciar automaticamente, libera somente as regras necessárias no perfil de rede **Privada**, inicia o Node e abre a configuração local.
4. No tablet/celular do operador, escaneie o QR mostrado no computador de produção.
5. Confirme o pareamento com o PIN temporário exibido fisicamente naquele computador.

O usuário não precisa descobrir ou digitar o endereço IP do computador.

### Rede local

Para controle local, o tablet/celular e os computadores de produção devem estar na **mesma rede local** — o mesmo Wi‑Fi, a mesma rede cabeada, ou ambos dentro da mesma LAN.

- A internet **não é necessária** durante a operação local de um culto já preparado.
- Redes de convidados/Guest Wi‑Fi podem usar isolamento de clientes e impedir que os aparelhos se encontrem.
- A descoberta automática de outros Live Nodes usa apenas a rede local.
- Quando a descoberta automática não for possível, endereço/IP manual existe somente em **Avançado** como fallback técnico.

## Vários computadores

Instale um Live Node em cada computador que precise conversar com apps ou hardware locais.

Exemplos:

- PC Projeção → Holyrics;
- PC Visual → Resolume Arena;
- PC Apresentação → ProPresenter;
- futuros PCs de transmissão, stage, áudio e outros providers.

Os Live Nodes anunciam sua presença localmente e aparecem no Studio para pareamento. **Descoberta não concede acesso:** a confiança só é criada depois da confirmação do PIN temporário e do vínculo com o ambiente/organização.

## Providers

O Live tenta esconder detalhes técnicos sempre que possível.

- **Holyrics:** normalmente usa a API local no mesmo computador. Quando o Holyrics exigir habilitar o API Server/token, o Live guia esse passo e testa imediatamente.
- **Resolume Arena/Avenue:** quando está no mesmo computador, o Live parte do endpoint local padrão e pede apenas que o Webserver/REST API esteja habilitado.
- **ProPresenter:** como a configuração/porta pode variar, o Live mostra o passo necessário e mantém o endereço técnico dentro da configuração avançada.

Nenhum provider deve ser exposto diretamente à internet para o fluxo local.

## Fallback alpha do Windows

Os arquivos `INSTALAR-MUSICSCALE-LIVE.cmd` e `install.ps1` continuam temporariamente no artefato alpha para desenvolvimento e recuperação. **Eles não fazem parte da experiência comercial pretendida.**

## macOS

A arquitetura já suporta o Live Node no macOS, mas a distribuição pública ainda precisa do instalador gráfico assinado/notarizado.

No pacote alpha atual, o fallback técnico ainda usa `install.command`. Antes de lançamento comercial, o happy path no macOS também deverá ser de duplo clique, sem Terminal.

## Segurança

- Tokens de providers não são transmitidos nos beacons de descoberta.
- A descoberta LAN transmite apenas identidade não secreta do Node e metadados de compatibilidade.
- O IP do peer é derivado do pacote recebido, não confiado a partir do conteúdo anunciado.
- O pareamento usa PIN temporário exibido fisicamente no computador alvo.
- Credenciais de pareamento são armazenadas como hash no Node.
- Configuração sensível de providers permanece local ao computador.
- No Windows, o token do Holyrics é protegido com DPAPI `CurrentUser`.
- No macOS, o token do Holyrics fica no Keychain e o arquivo local guarda apenas uma referência.
- Ao remover a configuração do Holyrics, o segredo externo também é removido do Keychain quando aplicável.
- O modo remoto/cloud-relay continua desabilitado nesta distribuição alpha.

## Estado desta distribuição

Esta é uma distribuição **alpha para testes controlados**.

Antes de distribuição pública ainda são obrigatórios:

- assinatura Authenticode do instalador/binário Windows;
- Developer ID + notarização no macOS;
- atualização automática assinada/verificada;
- certificação física final do credential vault nos computadores-alvo;
- certificação física Windows + iPad, Windows + Android e multi-PC;
- teste de queda de internet durante sessão ativa;
- validação de descoberta automática em roteadores/APs reais e diagnóstico de Guest Wi‑Fi/client isolation.


## Canal de release assinado

O repositório possui um workflow separado de release pública que só produz artefatos quando as credenciais de assinatura estiverem configuradas:

- Windows: binário e `MusicScaleLiveSetup.exe` assinados com Authenticode + timestamp e verificação pós-assinatura.
- macOS: binário assinado com Developer ID Application, pacote gráfico `.pkg` assinado com Developer ID Installer, notarizado e stapled pela Apple.

Certificados e senhas nunca entram no repositório. O workflow falha fechado quando qualquer credencial obrigatória de assinatura estiver ausente.
