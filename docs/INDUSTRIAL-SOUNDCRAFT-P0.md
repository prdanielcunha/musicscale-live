# Industrial primeiro — homologação Soundcraft Si Expression (P0)

Local alvo: OBPC Industrial, Londrina. Mesa digital Soundcraft **Si Expression** via **HiQnet**, NÃO Behringer X32 e NÃO Soundcraft Ui (protocolo totalmente diferente).

## Conclusão sobre o estado real
- Beta.4 em `production` (17/10/2026) controla inicialmente Behringer X32; **não controla a Si Expression**.
- PR #131 é um driver inicial read-only e diagnóstico de handshake/telemetria HiQnet em branch isolada; não é um mixer funcional, nem uma versão lançada.
- Em nenhum caso inventar status `connected` porque TCP abriu. `protocolConfirmed` só após HELLO HiQnet validado com device ID e session.
- Na sessão real, nenhum botão do Industrial pode alterar a mesa até teste manual controlado de canal desocupado.
- Si Expression não oferece FX e routing remoto pela API HiQnet exposta, conforme Mixing Station.

## Primeira coleta necessária (2 telas da própria mesa)
1. No console Soundcraft, menu **SYSTEM**: versão do firmware, IP address, subnet mask.
2. No menu **HIQNET**: *HiQnet Address* da mesa e *Access Control* (sem alterar permissões durante um culto).
3. Confirme que o cabo do roteador entra na porta HiQnet da mesa e o computador de controle está na mesma subnet, via Wi-Fi USB.
4. Com essa informação, validar primeiro detecção TCP+HiQnet em modo leitura, depois leitura real dos 16/24/32 canais conforme versão.
5. Na etapa seguinte, implementar fader/mute individuais e reverberação/auxiliares disponibilizados; testar cada ação com captura do estado após escrita. EQ, gate e comp com mesma verificação.
6. Depois da homologação: pacote Windows, painel mobile completo e deploy beta opcional; sem mudanças em Holyrics/Resolume ou em contas.

## Contingência **hoje**: controle real do celular
- App **Mixing Station** no iPhone (https://apps.apple.com/br/app/mixing-station/id1438352631), escolha série **Soundcraft Si**. Permite testar antes de comprar licença. Compra do módulo Soundcraft Si mostrada na App Store brasileira em 17/10/2026: R$39,90 (preço pode variar).
- Conecte iPhone ao Wi-Fi do roteador que está na porta HiQnet e permita rede local no iOS. Se não encontrar a mesa, confirme que está na mesma subnet e que broadcast está permitido; confira os endereços HiQnet exclusivos.
- Alternativa oficial em **iPad**: Soundcraft ViSi Remote (https://apps.apple.com/br/app/soundcraft-visi-remote/id524627131). Modelo e firmware determinam recursos.
- Evite atualização de firmware/reinicialização durante culto. Preserve operação física da mesa.

## Fontes técnicas
- https://help.harmanpro.com/en_US/hiqnet-third-party-programmer-documentation
- https://www.soundcraft.com/en-US/products/visi-remote
- https://dev-core.org/ms-docs/mixers/soundcraft/hiqnet/
- https://dev-core.org/ms-docs/mixers/soundcraft/si-performer/
- https://hiqontrol.readthedocs.io/en/latest/hiqnetproto.html (referência técnica de endereçamento Si Compact; requer validação na Si Expression)

## Configuração confirmada nas fotos de 18/10/2026 — Industrial
- Mesa Soundcraft Si Expression 3, software 1.8 Build 0012.
- Rede SYSTEM: DHCP, IP 192.168.0.148, máscara 255.255.255.0.
- HIQNET: Enabled; Console HiQnet Address 10596; Access Control Enabled.
- Device 1: All, endereço 1. Device 2: All, endereço 148. Outros dispositivos exibidos: None, 0.
- IDs HiQnet NÃO são endereços IP. Cada controle autorizado precisa ter um ID exclusivo.
- Não reiniciar a mesa nem tocar nos botões RESET CHANNELS/BUSES/PATCHING/ALL ou ADDRESS ASSIGN durante culto.

## Descoberta técnica e limitações
O Mixing Station documenta que esta família utiliza descoberta UDP/3804 e recebe uma conexão TCP iniciada pela própria mesa. A tentativa de cliente TCP direto no IP da Soundcraft, anteriormente usada na prova de conceito, foi retirada da execução. O diagnóstico agora usa o módulo soundcraftDiscovery.ts, com testes de rede e sem comandos de áudio. As mensagens são interpretadas como diagnóstico, nunca como permissão para controles automáticos. O módulo ainda exige validação de handshake na mesa física e NÃO CONTROLA áudio.

## Passos para o operador
1. iPhone em Ajustes -> Wi-Fi: conectar ao roteador ligado à porta HiQnet da Soundcraft. Confirmar IP da faixa 192.168.0.x, diferente de .148.
2. Instalar Mixing Station para iOS. Selecionar Add Mixer -> Soundcraft Si -> Si Expression; iOS exige licença para conectar à mesa (modo offline é gratuito).
3. Permitir rede local nas configurações de privacidade do iPhone.
4. Ajustar o endereço HiQnet do app para um ID disponível com permissão ALL. Os IDs existentes 1 e 148 só podem ser reutilizados caso não estejam ativos em outro dispositivo; não alterar ACL durante o culto.
5. Selecionar mesa encontrada; confirmar se nomes e faders correspondem à Soundcraft física. Fazer pequeno teste com canal desocupado.
6. Se não conectar: confirmar mesma subnet, broadcast permitido, roteador dedicado ligado à porta HiQnet, e aplicativo antigo fechado. Não reiniciar a mesa durante culto.
7. Para o futuro Live Node: PC com Ethernet internet e Wi-Fi USB 192.168.0.x (rede da mesa). O diagnóstico só será exibido depois de distribuída a versão do PR. Não confundí-lo com o controle manual pronto.

Fontes:
- https://help.harmanpro.com/en_US/sc-si-series/si-series-digital-mixers-faq
- https://mixingstation.app/ms-docs/mixers/soundcraft/hiqnet/
- https://mixingstation.app/ms-docs/mixers/soundcraft/si/
