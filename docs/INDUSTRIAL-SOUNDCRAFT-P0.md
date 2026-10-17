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
