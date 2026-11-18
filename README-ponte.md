# FaderDeck · fader-bridge

A ponte conecta o painel FaderDeck do celular a uma porta MIDI virtual no computador. Computador e celular precisam estar na mesma rede local. O loopMIDI precisa continuar em execução no Windows enquanto a DAW usar a porta.

> **Este README acompanha o pacote standalone `fader-bridge.zip`, que precisa de Node.js.** Para o aplicativo desktop instalado pelo `.exe`, você não precisa instalar Node.js nem executar comandos npm. Siga o [guia visual Windows](https://paylo4002ansatsu.github.io/FaderDeck/guia-midi-windows.html). A cópia local do guia e suas imagens fica em `client/guia-midi-windows.html` e `client/guia-assets/` neste repositório.

## Windows — aplicativo desktop

O instalador atual do FaderDeck para Windows é 64-bit. O FaderDeck não cria automaticamente uma porta MIDI virtual no Windows; para essa implementação, instale o [loopMIDI na página oficial](https://www.tobias-erichsen.de/software/loopmidi.html).

1. Baixe e instale o loopMIDI. Abra-o pelo menu Iniciar.
2. No campo **New port-name**, digite `FaderDeck` e clique no botão **+**. Confirme que a porta aparece na lista.
3. Mantenha o loopMIDI aberto ou minimizado na bandeja do Windows. A porta só funciona enquanto o loopMIDI estiver em execução. Se disponível, ative no menu do ícone a opção para iniciar em cada logon do Windows.
4. Abra o FaderDeck. No menu do ícone do aplicativo na bandeja, escolha **Portas MIDI e administração…**. Na tela, selecione **FaderDeck** em **Saída MIDI para a DAW**, clique em **Aplicar portas MIDI** e aguarde a confirmação.
5. O endereço local padrão da tela administrativa é `http://127.0.0.1:8787/bridge`. Se a porta 8787 estiver ocupada, o FaderDeck escolhe outra porta livre; use o endereço exibido pelo aplicativo ou o item do menu, que abre a rota correta.
6. Abra ou reinicie a DAW depois de criar a porta, para que ela atualize a lista de dispositivos. Habilite a entrada FaderDeck e mapeie um fader ou pad seguindo o tutorial visual.
7. Para usar o celular, escaneie o QR mostrado pelo FaderDeck. Computador e celular devem estar na mesma rede Wi‑Fi. Se o Windows Firewall perguntar, permita o FaderDeck em redes privadas.

O seletor **Entrada MIDI para MIDI Learn** na administração é opcional e serve para receber um controlador MIDI externo. Para enviar os controles do FaderDeck à DAW, selecione a saída.

## Windows — ponte standalone (opcional)

Use estas instruções somente se estiver executando o pacote `fader-bridge.zip`, em vez do aplicativo desktop instalado.

1. Instale Node.js 20 ou superior (versão LTS) pelo site oficial e confirme no PowerShell: `node -v` e `npm -v`.
2. Instale e abra o loopMIDI, crie a porta `FaderDeck` e mantenha o loopMIDI em execução.
3. Extraia o ZIP em uma pasta local. Abra o PowerShell nessa pasta. Na primeira vez, rode `npm install`; depois rode `npm start`.
4. Se a instalação de `@julusian/midi` precisar compilar o módulo nativo e falhar, instale Python 3 e Visual Studio Build Tools com a carga de trabalho C++ Desktop, feche e reabra o PowerShell e rode `npm install` novamente.
5. Abra `http://127.0.0.1:8787/bridge` no computador. Essa é a porta padrão; se estiver ocupada, use o endereço informado no terminal. Se o Firewall do Windows mostrar um aviso para Node.js, permita o acesso somente em redes privadas.
6. Na tela da ponte, selecione `FaderDeck` como **Saída MIDI para a DAW** e clique em **Aplicar portas MIDI**. A entrada MIDI é opcional e serve para MIDI Learn.
7. Escaneie o QR com a câmera do celular conectado à mesma rede Wi‑Fi, ou abra o endereço impresso no terminal e informe o código de pareamento.

> Não exponha a ponte à internet nem encaminhe a porta 8787 no roteador.

## macOS — aplicativo desktop ou ponte standalone

No aplicativo desktop, o FaderDeck cria automaticamente a porta MIDI virtual **FaderDeck**. Não é necessário ativar o IAC Driver. Se já houver uma porta IAC com o mesmo nome, use apenas uma delas.

Para executar a ponte standalone `fader-bridge.zip`, instale Node.js 20 ou superior (LTS), extraia o ZIP, entre na pasta pelo Terminal e rode `npm install` na primeira vez; para abrir a ponte, rode `npm start`. A porta **FaderDeck** também é criada automaticamente pelo módulo MIDI do macOS.

Se o módulo MIDI nativo precisar compilar e a instalação falhar, instale as ferramentas de linha de comando do Xcode com `xcode-select --install`, feche e reabra o Terminal e rode `npm install` novamente. Na ponte standalone, o endereço padrão da administração é `http://127.0.0.1:8787/bridge`; se a porta estiver ocupada, use o endereço mostrado no Terminal. Confirme **FaderDeck (virtual)** como saída e clique em **Aplicar portas MIDI** somente se alterar as portas.

No primeiro uso, permita conexões locais para o FaderDeck ou, na ponte standalone, para Node.js. O Firewall deve permitir redes privadas. Não exponha a ponte à internet.

## Conexão e diagnóstico do celular

No iPhone, escaneie o QR no Safari. A Tela de Início tem armazenamento próprio: na primeira abertura do ícone, informe IP:porta e código mostrados em `/bridge` (ou toque em **Colar**); o pareamento fica salvo nesse ícone e reconecta nos próximos usos. O modo **Direto** fica oculto no iOS, pois Safari não oferece Web MIDI. Se a conexão falhar, abra **⋯ → Diagnóstico**; o painel mostra endereço, token salvo, estado WebSocket, último erro, tentativas e latência. Sem conexão, aparece o banner **SEM PONTE — abra pelo QR do computador**.

Na página `/bridge`, confira o IP escolhido e os outros endereços de rede. Se o celular não conectar, pressione **Testar celular**, abra o link no iPhone e verifique o mesmo Wi‑Fi e as permissões de Firewall. Redes de convidados podem bloquear a comunicação entre aparelhos.

No pacote standalone, o código de pareamento é persistido no arquivo oculto `.faderdeck-token`, na pasta da ponte, e permanece após reinícios de `npm start`; para revogá-lo, abra `/bridge` no computador e escolha **Gerar novo código**. O layout (páginas e controles) é salvo em `faderdeck-layout.json` e sincronizado entre os aparelhos conectados. O aplicativo desktop armazena os dados de usuário fora do pacote instalado.

O arquivo distribuível `client/downloads/fader-bridge.zip` contém o servidor, os arquivos da ponte, o tutorial visual Windows e a pasta `client/` com suas imagens. Para regenerá-lo após atualizar o painel, o guia ou o servidor, execute `npm run package:bridge` no repositório (requer Python 3). O script valida as entradas do ZIP e evita incluir uma cópia recursiva do próprio arquivo. Se `client/index.html` estiver ausente, `npm start` mostra um aviso para usar o pacote completo.

## Configurar a DAW

Abra ou reinicie a DAW depois de criar a porta. Os nomes dos menus podem variar um pouco entre versões e idiomas. Para ver capturas, destaques e etapas numeradas, use o [guia visual Windows](https://paylo4002ansatsu.github.io/FaderDeck/guia-midi-windows.html).

- **REAPER:** em `Options → Preferences → Audio → MIDI Inputs`, ative `Enable input`; para parâmetros de FX via MIDI Learn, marque também `Enable input for control messages`. Abra o FX, selecione `Param → Learn` e mova o fader.
- **Ableton Live:** em `Ctrl+, → Link, Tempo & MIDI`, habilite `Remote` para mapear controles. Habilite `Track` se também quiser receber notas de pads em uma faixa MIDI. Use `Ctrl+M`, clique no parâmetro e mova o fader.
- **FL Studio:** em `Options → MIDI settings` ou com `F10`, selecione FaderDeck em `Input` e clique `Enable`. Para mapear, clique com o botão direito no parâmetro, escolha `Link to Controller` e mova o fader.
- **Cubase:** em `Studio → Studio Setup → MIDI Port Setup`, deixe `Visible` ativo. Use `In “All MIDI Inputs”` se quiser que a entrada apareça como entrada geral de faixas MIDI. Para funções do Cubase, adicione uma superfície MIDI Remote, selecione a porta de entrada, abra `Mapping Assistant`, escolha a função e clique `Apply Mapping`.
- **ChurchDAW:** em `Sistema → Áudio e MIDI`, selecione FaderDeck como entrada. Depois abra `Ferramentas → Mapear MIDI`, clique no controle desejado na tela e mova o fader. A página oficial informa que o mapeamento é salvo no projeto.
- **Logic Pro (macOS):** em `Logic Pro → Settings → MIDI → Inputs`, habilite a porta IAC como entrada de controle. Para atribuições, abra `Control Surfaces → Controller Assignments` e use Learn.

Pads de Program Change enviam uma seleção de programa; não têm estado “desligado” e funcionam como disparos. Pads Note/CC podem ser momentâneos ou toggle. Se estiver usando um pad de nota no Ableton como entrada de faixa, não mapeie a mesma nota como comando Remote, pois a nota deixa de tocar a faixa.

Se um controle não responder, confira a porta de saída selecionada no FaderDeck, a entrada habilitada na DAW, o canal MIDI e o número de CC/nota. Para controles do celular, confirme ainda o Wi‑Fi e a conexão com a ponte. O botão **Panic** do FaderDeck envia All Notes Off e Reset All Controllers. Na ponte standalone, o layout compartilhado fica em `faderdeck-layout.json` na pasta extraída; mantenha-a gravável e faça cópias de segurança.
