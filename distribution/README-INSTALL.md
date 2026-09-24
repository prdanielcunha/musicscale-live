# MusicScale Live Node — instalação beta

Este pacote contém o **MusicScale Live Node** e a interface local usada para conectar computadores de produção ao MusicScale Live.

A experiência normal é simples: **instalar no computador de produção, abrir o painel local e parear pelo QR/PIN**. Git, Terminal, PowerShell, IP, porta e configuração de roteador ficam fora do caminho principal.

## Windows

### Instalação recomendada

1. Abra `MusicScaleLiveSetup.exe`.
2. Confirme a permissão do Windows.
3. O instalador:
   - instala o Live Node e a interface local;
   - configura inicialização automática;
   - libera apenas TCP 4317 e UDP 4318 no perfil de rede **Privada**;
   - remove regras antigas do MillionsNest Live Node;
   - inicia o Node;
   - abre `http://127.0.0.1:4317/node`.
4. No tablet/celular, use o QR exibido no computador.
5. Confirme o PIN temporário mostrado nos dois dispositivos.

Os arquivos `INSTALAR-MUSICSCALE-LIVE.cmd` e `install.ps1` permanecem somente como recuperação técnica.

## macOS

O pacote de teste inclui **`MusicScaleLiveNode.pkg`**, além do fallback `install.command`.

### Instalação recomendada

1. Abra `MusicScaleLiveNode.pkg`.
2. Finalize o assistente do macOS.
3. O pacote instala o Node em `/Library/Application Support/MusicScaleLive`, registra o LaunchAgent e inicia o serviço automaticamente.
4. Abra o painel local em `http://127.0.0.1:4317/node`.

No canal público assinado, o mesmo `.pkg` é assinado com Developer ID, notarizado e stapled pela Apple.

## Linux x64

O pacote inclui `install.sh` e `uninstall.sh`.

### Instalação

```bash
./install.sh
```

O instalador usa um **systemd user service** quando disponível, inicia o Node automaticamente e abre o painel local via `xdg-open` quando suportado. Os arquivos ficam em `~/.local/share/musicscale-live`.

## Rede local

O tablet/celular e os computadores de produção precisam compartilhar a mesma LAN.

- Internet não é necessária para operar um culto já preparado.
- Guest Wi‑Fi/client isolation pode impedir descoberta e controle entre dispositivos.
- Descoberta automática usa apenas a LAN.
- IP/porta manual existe em **Avançado** como fallback.
- Instale um Live Node em cada computador que precise controlar software/hardware local.

Exemplos:

- PC Projeção → Holyrics;
- PC Visual → Resolume Arena;
- PC Apresentação → ProPresenter;
- computadores futuros de transmissão, áudio, luz e outros providers.

## Providers

- **Holyrics:** o Live guia a ativação da API e testa a comunicação.
- **Resolume Arena/Avenue:** usa REST/WebSocket quando disponíveis.
- **ProPresenter:** usa a API de rede disponível na versão instalada.
- Providers futuros seguem o mesmo contrato de capabilities; nenhum deles deve ser exposto diretamente à internet para o fluxo local.

## Segurança

- Beacons de descoberta nunca levam tokens.
- O endereço do peer é derivado do pacote LAN recebido.
- Pareamento usa PIN temporário exibido fisicamente.
- Credenciais de pareamento são armazenadas como hash.
- Segredos de providers permanecem no computador.
- Windows protege token do Holyrics com DPAPI `CurrentUser`.
- macOS armazena o token no Keychain e mantém apenas uma referência no arquivo local.
- Remover a configuração do Holyrics remove o segredo externo quando aplicável.
- Cloud relay permanece desabilitado por padrão.

## Canal beta e canal assinado

A versão beta atual é destinada à certificação completa do roadmap e aos testes físicos antes da distribuição comercial geral.

O workflow de release pública produz:

- Windows: Node + `MusicScaleLiveSetup.exe` assinados com Authenticode e timestamp;
- macOS: Node assinado, `.pkg` assinado com Developer ID Installer, notarizado e stapled;
- hashes SHA-256 dos artefatos.

Certificados e senhas nunca entram no repositório. O release assinado falha fechado quando as credenciais necessárias não estão configuradas.

## Testes físicos ainda obrigatórios antes de declarar certificação final

- Windows + iPad;
- Windows + Android;
- Holyrics e Resolume em computadores diferentes;
- ProPresenter-first;
- queda da Internet preservando a LAN;
- restart do Live Node sem duplicar comandos;
- validação de descoberta em roteadores/APs reais;
- confiança do instalador assinado no Windows/macOS;
- p95 real comando → estado observado;
- teste com voluntário sem treinamento.
