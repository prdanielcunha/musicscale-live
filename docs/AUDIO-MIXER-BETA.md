# MusicScale Live — Mesa de Som (X32) — beta de homologação

**Status:** PR #129, candidata a testes; NÃO certificada em hardware, NÃO disponível na versão de produção até promoção.

## Escopo da primeira entrega
- Behringer X32, controle manual OSC por UDP **10023**, via MusicScale Live Node instalado em PC Windows.
- 32 entradas, 8 entradas auxiliares, 8 retornos FX, 16 buses e Main LR na interface.
- Faders e mute, panorama quando suportado; EQ 4 bandas e 16 envios de cada canal de entrada.
- Leitura de parâmetros observados na mesa e atualização automática da interface; comando de escrita só conta como confirmado após resposta efetiva à consulta.
- A leitura do estado não é equivalente a metering RMS/peak em tempo real: medidores ainda serão adicionados.
- Não opera roteamento, preamp gain, 48V, snapshots, equalização de buses/master e automação de áudio.
- Soundcraft Si Expression exige cliente **HiQnet** diferente, não coberto pela beta da X32. NÃO tentar configurar Soundcraft como OSC/X32.

## Rede preexistente das igrejas
- **OBPC Monte Castelo, Cambé:** X32 em roteador dedicado. PC de produção mantém internet por Ethernet e conecta ao Wi-Fi do roteador da X32 por adaptador USB já disponível. O celular entra no mesmo Wi-Fi da X32. O MusicScale Live Node controla a mesa e serve a tela ao celular pelo IP do adaptador Wi-Fi da mesa.
- **OBPC Industrial, Londrina:** mesa Soundcraft Si Expression em roteador HiQnet próprio; não usar o driver X32. Seguir com ViSi Remote ou solução já funcional enquanto a integração HiQnet não for implementada e homologada.
- Wi-Fi USB não instala software na mesa nem roteia áudio digital. É somente rede de controle. Não fazer bridge entre a rede de internet e a rede das mesas.

## Setup na X32 (operador técnico, antes do culto)
1. Verifique o IP da X32 em **Setup > Network** na própria mesa; ele deve ser privado (192.168.x.x, 10.x.x.x etc).
2. Conecte o Wi-Fi USB do PC ao roteador isolado da X32. Teste ping do PC ao IP da X32.
3. Inicie a **build nova** do Live Node (não uma beta.3 antiga). No PC acesse http://127.0.0.1:4317 ou /node.
4. Na tela local do MusicScale Live, abra a seção Mesa de Som, digite o IP da X32 e clique **Conectar X32**. Configuração de IP só é permitida no próprio PC.
5. No celular, conecte-se ao Wi-Fi da mesa, abra http://IP_DO_PC_NO_WIFI_DA_MESA:4317 (não o IP Ethernet do PC) e conclua pareamento com o Live Node por PIN/QR.
6. Abra **Mesa de Som**. Verifique status online, nomes e faders reais. Antes de qualquer ajuste, compare um canal com o estado físico da mesa.
7. **Teste com canal que não esteja sendo usado e PA protegido**: faça microajuste de volume, confira fader físico e retorno observado. Depois teste mute e EQ de uma banda no mesmo canal.
8. Não teste Master, mute de microfones ativos ou ganho crítico durante culto. Sempre deixe o controle na própria mesa como fallback.

## O que significa cada status
- *Mesa conectada:* o Live Node recebeu resposta OSC **do IP/porta configurados** nos últimos 15 segundos.
- *Aguardando a mesa:* há um endereço configurado, mas não ocorreu resposta recente.
- *Ajuste confirmado:* a leitura de volta retornou um valor numérico compatível.
- *Comando enviado, mas sem confirmação:* UDP entregue à rede **não garante** ajuste na mesa; conferir fisicamente.

## Gate de homologação
- npm run typecheck, npm test, npm run build e workflows de segurança.
- Teste X32 real: nomes dos 32 canais, leitura inicial, movimento físico espelhado, mute, 4 bandas EQ, 16 sends, Master com confirmação, dupla sessão, Wi-Fi reiniciado, Node reiniciado, perda da internet, recuperação.
- Assinatura e distribuição oficial de instalador continuam pendentes na base MusicScale Live. Artefatos atuais de CI são beta não assinados.
- Somente depois de testes físicos poderá ser considerada estável. Em produção, disponibilizar como beta opcional sem operações automáticas.

## O que vem depois
1. Driver HiQnet bidirecional para Soundcraft Si Expression (UDP discovery + TCP estabelecido pela mesa); requer validação de protocolo, licença e hardware reais. A Soundcraft não disponibiliza remotamente FX e routing nesta linha.
2. Dinâmica/gate/HPF/gain/48V com permissões e confirmações conforme risco.
3. Medidores de canal e buses, snapshots de configuração não destrutivos, perfis de ambiente e acesso por função.
4. Assistente de IA de som para sugerir ajuste com base em dados observados, *sem executar áudio por conta própria*.
5. Automação por escala/música, somente após homologação manual em ambos os locais.
