# Validação MIDI e conectividade do FaderDeck

Este roteiro diferencia **testes automatizados com drivers simulados** de **testes em hardware e sistemas reais**. Os testes automatizados não comprovam compatibilidade física com uma interface, DAW, driver ou rede corporativa específica.

## O que a CI valida hoje

`npm test` executa os testes Node.js, sem depender de dispositivo MIDI conectado. Os doubles/fakes de driver simulam enumeração de portas, seleção, entrada, saída, porta virtual, falha de abertura e reconexão. Os testes validam a segmentação e o encaminhamento de Note On, Note Off, Control Change, Program Change e mensagens em canais diferentes. Também exercitam autenticação, rotas HTTP, persistência atômica/debounce, reconexão WebSocket e vinte pings sequenciais em loopback.

A medida de ping da CI representa somente round-trip de um processo cliente-servidor no mesmo computador. Não é benchmark de rede Wi-Fi, iPhone, latência MIDI física nem critério para uso ao vivo. Os testes de portas virtuais macOS são simulações; não criam IAC nem conversam com hardware.

## Ensaio físico em macOS

1. Instale e abra o FaderDeck. Confirme que o aplicativo inicia a ponte e que a porta virtual **FaderDeck** aparece na DAW ou em um monitor MIDI.
2. Se houver uma porta IAC com o mesmo nome, desative uma das duas fontes para evitar duplicidade. Selecione FaderDeck como destino/entrada na DAW, conforme a direção do teste.
3. Envie no painel MIDI do FaderDeck controles por faders. Confirme no monitor/DAW os bytes, canal e valores esperados; verifique mudanças de Control Change.
4. Envie MIDI da DAW/interface para a entrada configurada no FaderDeck e confirme o recebimento/MIDI Learn.
5. Com o aplicativo em uso, desconecte e reconecte a interface ou encerre/reabra a DAW. Verifique se a porta aparece novamente, se o app não trava e se a porta pode ser selecionada outra vez na página `/bridge`.
6. Reinicie o app e confirme que layout e código persistem e que o destino MIDI continua utilizável. Registre modelo/versão de macOS, DAW, interface e resultado.

## Ensaio físico em Windows

1. Instale e inicie loopMIDI e crie uma porta virtual. No FaderDeck, abra `/bridge` e selecione a porta como saída para a DAW; configure também uma entrada se for validar MIDI Learn.
2. Verifique CC e canais MIDI no monitor MIDI da DAW. Confirme os valores movendo faders e compare mensagens de entrada e saída.
3. Pare e inicie loopMIDI, desconecte/reconecte a interface ou reinicie a DAW. Confirme que o app continua responsivo, informa falhas de forma clara e permite selecionar novamente a porta.
4. Repita após fechar e reabrir o FaderDeck. Anote versão do Windows, loopMIDI, DAW, driver/interface e resultado.

## Ensaio iPhone e rede

1. Conecte o iPhone e o computador à mesma rede Wi-Fi não isolada. Na página `/bridge` do computador, escaneie o QR com a câmera do iPhone e confirme a conexão WebSocket.
2. Mova um fader dos dois lados. Confirme sincronização de layout/valor e emissão MIDI na DAW. Deixe conectado por alguns minutos e registre desconexões e recuperação.
3. Repita com Safari e, se aplicável, com o ícone instalado na Tela de Início. Feche/reabra o painel e verifique se o pareamento persistente reconecta.
4. Em rede corporativa, verifique com o administrador se há isolamento entre clientes, bloqueio de tráfego local ou regras de firewall. Registre a rede e a mensagem apresentada. Não exponha o servidor diretamente à Internet sem revisão de segurança e autorização da organização.

## Registro recomendado

Para cada ensaio, registre data, versão do FaderDeck, sistema operacional, DAW, interface/MIDI driver, tipo de conexão, mensagem MIDI esperada e observada, latência observada por um método independente, perdas/desconexões e passos para reproduzir. Marque cada resultado como **simulado** ou **hardware real**; não misture ambos em relatórios de compatibilidade.
