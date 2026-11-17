# FaderDeck · fader-bridge

A ponte conecta o painel FaderDeck aberto no celular a uma porta MIDI virtual no computador. Computador e celular precisam estar na mesma rede local. O programa roda no computador enquanto a DAW estiver usando o painel.

## Windows

1. Instale o Node.js 20 ou superior (versão LTS) pelo site oficial do Node.js e confirme no Terminal/PowerShell: `node -v` e `npm -v`.
2. Instale e abra o loopMIDI. Crie uma porta MIDI virtual com um nome fácil de reconhecer, por exemplo `FaderDeck`.
3. Extraia o ZIP em uma pasta local. Abra PowerShell nessa pasta. Na primeira vez, rode `npm install`; depois rode `npm start`.
4. Se a instalação de `@julusian/midi` precisar compilar o módulo nativo e falhar, instale Python 3 e Visual Studio Build Tools com a carga de trabalho C++ Desktop, feche e reabra o PowerShell e rode `npm install` novamente.
5. Abra `http://localhost:8787/bridge` no computador. Se o sistema mostrar um aviso do Firewall do Windows, permita o acesso em redes privadas.
6. Na tela da ponte, selecione `FaderDeck` (ou a porta MIDI virtual criada) como saída. A entrada MIDI é opcional e serve para MIDI Learn. Clique em **Aplicar portas MIDI**.
7. Escaneie o QR com a câmera do celular. O celular deve estar no mesmo Wi‑Fi. Se preferir, abra o endereço impresso no terminal e informe o código de pareamento exibido pela ponte.
8. Na DAW, habilite essa porta MIDI virtual como entrada/controle, conforme o guia abaixo.

## macOS

1. Instale Node.js 20 ou superior (versão LTS) e confirme no Terminal: `node -v` e `npm -v`.
2. A ponte cria automaticamente a porta MIDI virtual **FaderDeck**. Não é necessário ativar o IAC Driver; se já houver uma porta IAC com o mesmo nome, use apenas uma delas.
3. Extraia o ZIP. No Terminal, entre na pasta extraída e rode `npm install` na primeira vez; para abrir a ponte, rode `npm start`.
4. Se o módulo MIDI nativo precisar compilar e a instalação falhar, instale as ferramentas de linha de comando do Xcode com `xcode-select --install`, feche e reabra o Terminal e rode `npm install` novamente.
5. Abra `http://localhost:8787/bridge`, confirme a porta **FaderDeck (virtual)** selecionada como saída e, se desejado, escolha uma entrada para MIDI Learn. Clique em **Aplicar portas MIDI** somente se alterar as portas.
6. Escaneie o QR com o celular na mesma rede Wi‑Fi. Se preferir, use o endereço e o código impressos no Terminal.
7. Na DAW, habilite a porta virtual **FaderDeck** como entrada/controle, conforme o guia abaixo.

> Deixe o computador conectado ao Wi‑Fi, o terminal com `npm start` aberto e a porta virtual ativa. Se o Firewall bloquear conexões locais, permita o Node.js somente em redes privadas. Não exponha a ponte à internet nem encaminhe a porta 8787 no roteador.

O QR abre o FaderDeck e inicia a conexão automaticamente. O código de pareamento é persistido no arquivo oculto `.faderdeck-token`, na pasta da ponte, e permanece após reinícios de `npm start`; para revogá-lo, abra `/bridge` no computador e escolha **Gerar novo código**. O layout (páginas e controles) é salvo em `faderdeck-layout.json` e sincronizado entre os aparelhos conectados.

No iPhone, use o QR no Safari. A Tela de Início tem armazenamento próprio: na primeira abertura do ícone, informe IP:porta e código mostrados em `/bridge` (ou toque em **Colar**); o pareamento fica salvo nesse ícone e reconecta nos próximos usos. O modo **Direto** fica oculto no iOS, pois Safari não oferece Web MIDI. Se a conexão falhar, abra **⋯ → Diagnóstico**; o painel mostra endereço, token salvo, estado WebSocket, último erro, tentativas e latência. Sem conexão, aparece o banner **SEM PONTE — abra pelo QR do computador**.

Na página `/bridge`, confira o IP escolhido e os outros endereços de rede. Se o celular não conectar, pressione **Testar celular**, abra o link copiado no iPhone e verifique o mesmo Wi-Fi e o Firewall do Mac. O arquivo distribuível `client/downloads/fader-bridge.zip` contém o servidor, os arquivos da ponte e a pasta `client/` completa. Para regenerá-lo após atualizar o painel ou o servidor, execute `npm run package:bridge` no repositório (requer Python 3); o script valida as entradas do ZIP e evita incluir uma cópia recursiva do próprio arquivo. Se `client/index.html` estiver ausente, `npm start` mostra um aviso para usar o pacote completo.

## Configurar a DAW

Os nomes exatos dos menus podem variar conforme a versão e o idioma. Pads de Program Change enviam um disparo de seleção de programa; eles não têm estado “desligado” e por isso funcionam como momentâneos. Pads Note/CC podem ser momentâneos ou toggle.

| DAW | Habilitar a entrada | Aprender um parâmetro |
| --- | --- | --- |
| **ChurchDAW** | Abra a aba **Áudio e MIDI** e habilite como entrada MIDI a porta virtual da ponte (`FaderDeck` no macOS; no Windows, o nome da porta loopMIDI). | Ative **Mapear MIDI**, clique no controle desejado na tela da ChurchDAW e mova o fader/pad correspondente no FaderDeck. O mapeamento fica salvo no projeto. Use um número de CC diferente para cada fader e confira o canal MIDI. Se a porta não aparecer, feche e reabra a ChurchDAW depois de aplicar as portas na ponte. |
| **Ableton Live** | **Preferências/Settings → Link, Tempo & MIDI**; na linha de entrada `loopMIDI` ou `IAC Driver`, habilite **Track** e **Remote** conforme o uso. | Entre em MIDI Map Mode (`Ctrl+M` no Windows ou `Cmd+M` no Mac), clique no controle da DAW, mova o fader/pad no FaderDeck e saia do modo de mapeamento. |
| **FL Studio** | **Options → MIDI settings**; selecione a porta virtual em **Input** e habilite o dispositivo. | Clique com o botão direito no parâmetro e escolha **Link to controller…**; mova o fader/pad e confirme o vínculo. |
| **REAPER** | **Options → Preferences → Audio → MIDI Devices**; habilite a porta virtual como entrada e, se for mapear ações, como entrada para mensagens de controle. | Para parâmetros de FX, abra **Learn** no controle/automação do parâmetro e mova o fader; para ações, use a lista de ações e a opção de adicionar atalho por MIDI. |
| **Cubase** | **Studio → Studio Setup → MIDI Port Setup**; habilite a porta como entrada. Para superfície de controle, adicione o dispositivo correspondente em **Remote Devices/MIDI Remote**. | Na superfície MIDI Remote, use **Learn/Mapping Assistant**, selecione o controle do Cubase e mova o fader/pad para criar o vínculo. |
| **Logic Pro** | **Logic Pro → Settings → MIDI → Inputs**; habilite a porta IAC como entrada de controle. | Abra **Control Surfaces → Controller Assignments**; use o modo Learn, selecione o parâmetro e mova o controle no FaderDeck. Atribuições de Smart Controls também podem ser feitas pelo modo Learn. |

Se um valor não responder, confira: porta virtual habilitada na DAW; canal MIDI e número CC/notas; modo Learn encerrado; e fader-bridge ainda em execução. O botão **Panic** do FaderDeck envia All Notes Off e Reset All Controllers. A ponte guarda o layout compartilhado em `faderdeck-layout.json` na pasta onde o pacote standalone foi extraído; mantenha essa pasta gravável e faça cópias de segurança do arquivo.
