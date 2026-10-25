# OBPC Industrial — Soundcraft Si Expression 3 (HiQnet nativo, zero licenças)

**Estado: diagnóstico funcional em código / hardware NÃO certificado.**
Não confundir este recurso com controle completo de áudio. A mesa e o computador
estão no local físico: não há acesso remoto do GitHub às placas Wi-Fi do Windows
ou à mesa para verificar pacotes e movimento de faders.

## Instalação existente (não reconfigurar)

- Mesa Soundcraft Si Expression 3: firmware `1.8 Build 0012`,
  IP `192.168.0.148/24` via DHCP, MAC `00:17:24:82:29:64`, HiQnet `10596`.
- PC de produção: adaptador Wi-Fi SOM `192.168.0.158/24` no roteador
  **dedicado** à mesa. Outro adaptador (Ethernet) está na OBPC com acesso
  à Internet e ao celular na rede OBPC.
- Celular/tablet deve continuar na rede OBPC, conversando com
  MusicScale Live Node no PC. **Não usar Windows Bridge, ICS, VLAN, router WAN**.
- Comandos HiQnet devem ser vinculados explicitamente à interface Wi-Fi SOM;
  jamais enviados pela Ethernet com Internet.
- Nodo Live e controlador da X32 de Cambé devem permanecer independentes.
- Nenhuma dependência do Mixing Station, assinatura ou software comercial.

## Diagnóstico sem alterar o som

No computador de produção, **após instalar a versão correspondente do Live
Node**, abra:

`http://127.0.0.1:4317/local/audio/soundcraft/probe`

O serviço de diagnóstico faz somente uma busca HiQnet UDP na rede SOM.
Ele abre um listener TCP temporário em `192.168.0.158:3804`, e o fecha
após a tentativa. Não envia comandos de fader/mute/gain/scene e não
reconfigura a mesa ou o Windows. A tela de áudio do MusicScale Live exibe
o último diagnóstico no painel **Industrial · Soundcraft**.

- `interface-missing`: não foi detectado um adaptador com IP SOM.
- `port-busy`: outro programa pode estar ocupando TCP/UDP 3804.
- `network-timeout`: sem resposta; conferir firewall do Windows
  somente para o IP da SOM, broadcast, vínculo HiQnet 1337 na mesa e
  estado da interface, sem mexer na Ethernet/roteador.
- `hiqnet-received`: a rede HiQnet respondeu; não significa que
  leitura ou alteração de volume foi homologada.

Teste adicional local sem modificar a mesa: no Windows PowerShell,
`ping -S 192.168.0.158 192.168.0.148`. Resposta ICMP pode ser
bloqueada, então falha no ping por si só não prova falha HiQnet.

## Sequência restante antes de liberar faders

1. Obter DiscoInfo confirmado no firmware 1.8 e validar o endereço HiQnet
   remoto 10596, verificação física do MAC e roteamento no adaptador Wi-Fi.
2. Implementar TCP session/Hello/Keepalive com gerenciamento de reconexão,
   sem abrir a porta na interface Ethernet.
3. Implementar MultiParamGet read-only por PID/objeto e comprovar valores
   com ajuste manual de um canal não crítico; ler alterações físicas.
4. Só então habilitar writes atrás de RBAC, confirmação de estado,
   limites de salto e logs. Primeiro um canal de teste; depois demais.
5. Testar rede desconectada de Internet, recuperação e vídeo/meters
   sem impactar latência; manter controle físico da Soundcraft sempre.
6. Validar na Si Expression 3 as capacidades reais; desabilitar FX,
   roteamento, recalls e controles não suportados pelo firmware.

Documentação:
- https://help.harmanpro.com/en_US/hiqnet-third-party-programmer-documentation
- https://help.harmanpro.com/si-and-vi-mixers-hiqnet-connectivity-and-wireless-router-configuring
- https://dev-core.org/ms-docs/mixers/soundcraft/hiqnet/

**Nunca publicar controles ativos em produção apenas por passes de CI.**
