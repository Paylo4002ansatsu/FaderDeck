# FaderDeck — controlador MIDI para sua DAW

O FaderDeck permite montar um painel MIDI com **faders e pads** e controlar sua DAW pelo computador ou pelo celular. No Mac, o aplicativo inclui a ponte MIDI, cria a porta virtual **FaderDeck** e fica disponível na barra de menus.

> **Para instalar e usar o aplicativo baixado, você não precisa instalar Node.js, npm nem executar comandos no Terminal.** As instruções de desenvolvimento estão no final deste README.

## Downloads

Use o instalador correspondente ao seu computador:

- **Windows:** [Baixar FaderDeck para Windows](https://github.com/Paylo4002ansatsu/FaderDeck/releases/download/1.0.0/FaderDeck-Windows-Setup.exe) — instalador Windows Setup, versão 1.0.0.
- **macOS:** [Baixar FaderDeck para macOS](https://github.com/Paylo4002ansatsu/FaderDeck/releases/download/1.0.1/FaderDeck-Mac.dmg) — pacote universal para Macs Intel e Apple Silicon.

Os mesmos botões estão disponíveis na [página oficial do FaderDeck](https://paylo4002ansatsu.github.io/FaderDeck/).

## Instalação

### Windows

1. Baixe o instalador `.exe` pelo botão **Windows**.
2. Abra o arquivo baixado e siga as etapas apresentadas pelo instalador.
3. Inicie o FaderDeck pelo menu Iniciar ou pelo atalho criado na instalação.

### macOS

1. Baixe e abra o arquivo `.dmg`.
2. Arraste o **FaderDeck** para a pasta **Aplicativos**.
3. Na primeira abertura, o macOS pode avisar que o app não é de um desenvolvedor identificado porque ele ainda não é assinado/notarizado. Se isso ocorrer, Control-clique no app, escolha **Abrir** e confirme. Se necessário, permita a abertura em **Ajustes do Sistema → Privacidade e Segurança**.
4. Permita o acesso à **rede local** e as conexões de entrada no **Firewall** quando o macOS solicitar; isso é necessário para conectar o celular.

## Conectar o celular e a DAW

1. Abra o FaderDeck no computador. A tela de boas-vindas mostra o QR e o endereço de conexão.
2. Conecte o celular e o computador à **mesma rede Wi-Fi** e escaneie o QR com a câmera do celular.
3. Monte ou escolha um painel com faders e pads. Na DAW, habilite a entrada MIDI **FaderDeck** quando disponível e mapeie os controles desejados.

Se a porta de rede padrão `8787` já estiver ocupada, o aplicativo escolhe outra porta livre e mostra o endereço atualizado. Caso o celular não conecte, confira primeiro a mesma rede Wi-Fi e a permissão do Firewall.

## O que o FaderDeck oferece

- **Painel personalizável:** adicione faders e pads para controlar parâmetros e disparar comandos MIDI.
- **Modo Palco:** interface de controle preparada para uso durante uma apresentação, com navegação entre os controles.
- **Ponte integrada:** comunicação entre o painel, o celular e a saída MIDI local.
- **Pareamento por QR:** conecte o celular sem digitar manualmente o endereço; os dispositivos precisam estar na mesma rede local.
- **Porta MIDI virtual no macOS:** o app cria a porta **FaderDeck** automaticamente. Se houver uma porta IAC com o mesmo nome, mantenha apenas uma delas habilitada para evitar duplicidade.
- **Barra de menus no macOS:** veja o estado da ponte e dos aparelhos conectados; abra o painel, mostre ou copie o link do celular, acesse as portas MIDI, renove o código, configure a inicialização com o Mac ou encerre o aplicativo.
- **Janela que pode ser escondida:** fechar a janela não encerra o FaderDeck; o app continua na barra de menus. Para encerrar, use **Sair** no menu do FaderDeck.

## Dados e atualizações

No macOS, os layouts, o token de pareamento e os dados do painel ficam em:

```text
~/Library/Application Support/FaderDeck
```

Esses dados ficam fora do pacote do aplicativo e são preservados ao atualizar ou reinstalar. Dados legados compatíveis podem ser migrados automaticamente. Para fazer backup, copie essa pasta.

## Desenvolvimento e criação de instaladores

Esta seção é apenas para quem vai executar ou empacotar o código-fonte. Os usuários que baixaram os instaladores não precisam seguir estes passos.

Requisitos para desenvolvimento: **Node.js 22 ou mais novo**. Para compilar a versão macOS, use um Mac; o módulo MIDI nativo depende da plataforma. As Ferramentas de Linha de Comando do Xcode podem ser necessárias se a instalação solicitar. Para regenerar o ZIP da ponte, também é necessário Python 3.

```bash
npm install
npm test              # executar testes automatizados
npm start              # abrir o app para teste
npm run dist           # gerar instaladores macOS (DMG e ZIP)
npm run dist:universal # gerar app macOS universal (Intel + Apple Silicon)
npm run dist:win       # gerar instalador Windows NSIS
npm run package:bridge # regerar client/downloads/fader-bridge.zip
```

Os artefatos Electron são salvos em `release/`. A ponte também pode ser iniciada separadamente com `npm run bridge`; o ZIP standalone fica em `client/downloads/fader-bridge.zip` e inclui a pasta `client/`.
