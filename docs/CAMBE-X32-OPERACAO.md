# Cambé Monte Castelo X32 pelo celular

## Pacote beta 0.1.0-beta.7

O PC executa um MusicScale Live Node. Ele alcança a X32 pela rede de som e atende o celular pela rede OBPC. Holyrics e Arena continuam nas suas instalações e com a ligação HDMI/captura atual. Não é necessário mover os programas para uma pasta comum.

A captura de 18 de outubro mostrou duas janelas: MusicScale Live e o NestLive. O NestLive é outro módulo e já contém seu próprio engine de produção; os dois não devem ser tratados como processos intercambiáveis. Este guia é somente para a alternativa MusicScale Live independente, não para o NestLive. A imagem não permite medir CPU ou memória, identificar as portas de ambos, nem confirmar qual PC hospeda o Arena. Não apagar pastas ou configurações antigas para resolver duplicação.

## Instalação e rede

1. Antes do culto, instale MusicScaleLiveSetup.exe do pacote beta.7. O instalador encerra o executável atual e os executáveis legados reconhecidos e remove os valores de inicialização automática reconhecidos. Nenhuma pasta de dados legada é apagada. Serviços, tarefas ou atalhos instalados manualmente precisam ser verificados separadamente.
2. Abra http://127.0.0.1:4317/node. Confira a versão. Mantenha somente o Node escolhido em execução neste computador. Cada computador de produção necessário pode ter seu próprio Node, nomeado e pareado.
3. Mantenha o PC na rede OBPC com internet e use o adaptador Wi-Fi USB já disponível para a rede da X32. Não crie ponte de rede ou compartilhamento de internet.
4. Na X32 física, abra Setup > Network e anote IP e máscara. Não use o IP da Soundcraft do Industrial. Os endereços de Cambé precisam ser lidos no equipamento.
5. No painel local, abra Mesa de Som > Somente para locais com Behringer X32 e informe o IP real. Clique Conectar X32. Salvar um IP ainda não significa que a mesa respondeu.
6. Em Placa de rede usada pelo celular, escolha o IP do PC na OBPC. Escaneie esse QR no celular conectado à OBPC. Conclua o pareamento com o PIN exibido no PC.
7. No app pareado, confira organização e local Cambé/Monte Castelo e selecione Behringer X32. O perfil de Londrina continua separado.
8. Se as duas placas tiverem sub-redes iguais, pare e confira IPs, máscaras e rotas. Escolher o QR não corrige uma rota ambígua do Windows. Não alterar roteador ou endereço da mesa durante culto.

## Aceite físico antes de usar

Compare os nomes e a posição de um fader com a mesa. Em canal sem uso, faça um ajuste pequeno, espere Ajuste confirmado pela mesa e confira o movimento físico. Restaure o valor. Repita mute e um envio apenas em canal de teste. Mova um fader na mesa e confira o celular. Teste também a tela do celular depois de bloquear e desbloquear e a permanência da operação local sem internet.

Se ficar Aguardando a mesa, conferir IP, adaptador conectado à rede de som, rota e UDP 10023. Se o celular não abrir o app, conferir IP do PC na OBPC, rede privada no Windows, firewall TCP 4317 e isolamento de clientes no Wi-Fi.

## Desempenho e atualização

A beta.7 usa um socket OSC para a X32 e renova /xremote a cada sete segundos. A leitura de snapshots não dispara consultas à mesa. Leituras iniciais de detalhes de um mesmo canal são agrupadas e limitadas. Cada celular recebe os valores observados por stream HTTP autenticado, com janela de agrupamento de 100 ms. Valores inalterados não são reenviados a cada quadro; há heartbeat de cinco segundos. O intervalo de 100 ms é um parâmetro de software e não uma medição da latência física total.

A tela interrompe o stream ao ficar oculta, tenta reconectar ao voltar e mantém fallback para Nodes antigos. Bearer tokens permanecem no cabeçalho. O servidor revalida pareamento e local a cada cinco segundos, limita clientes e encerra conexões lentas para não acumular memória sem limite. Uma segunda instância que tenta ocupar a mesma porta encerra antes de carregar estado, sondar providers ou descobrir peers.

A descoberta automática de Arena ausente recua de 10 para 20, 40 e no máximo 60 segundos entre tentativas, com log da transição. Providers configurados continuam disponíveis para teste manual. Isso não desliga o Arena nem altera a captura existente. Reiniciar o Node ainda é necessário para usar o código novo.

Nesta versão, o escopo é controle manual. Medidores RMS/peak contínuos ainda não estão implementados. Ganho de pré-amplificador, phantom 48V, recall de cenas e automação de áudio não são disponibilizados. A Soundcraft exige sua integração própria.

## Validação

Os testes automatizados de UDP usam um simulador, não a mesa física. A aprovação desses testes e do empacotamento não substitui o aceite físico acima nem representa assinatura do instalador ou certificação comercial. Medir CPU, memória, disco e latência no PC de Cambé com Holyrics e Arena em operação antes de afirmar números de desempenho.

## Fontes técnicas

- Node HTTP e backpressure: https://nodejs.org/api/http.html
- SSE e enquadramento de mensagens: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
- Implementações e documentação de protocolo X32 de Patrick-Gilles Maillot: https://github.com/pmaillot/X32-Behringer
