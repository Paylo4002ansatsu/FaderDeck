<p align="center">
  <img src="docs/logo.svg" alt="FaderDeck" width="72">
</p>

# FaderDeck

![Versão 1.0.8](https://img.shields.io/badge/vers%C3%A3o-1.0.8-20b2aa)
![macOS Universal](https://img.shields.io/badge/macOS-Universal%20%7C%20Apple%20Silicon-555)
![Windows x64](https://img.shields.io/badge/Windows-x64-555)
![Licença não informada](https://img.shields.io/badge/licen%C3%A7a-n%C3%A3o%20informada-555)

Transforme seu celular ou tablet em um controlador MIDI tátil por Wi-Fi local, com baixa latência. Controle sua música em softwares como Kontakt e ChurchDAW; MainStage e REAPER também podem receber MIDI, mas sua compatibilidade com o FaderDeck ainda não está documentada.

**[Baixar o FaderDeck](https://github.com/Paylo4002ansatsu/FaderDeck/releases)** · **[Site oficial](https://fader-deck.vercel.app/)** · **[Novidades](CHANGELOG.md)**

## Recursos

- **MIDI por Wi-Fi local:** conecte pelo QR Code usando HTTP e WebSocket, sem precisar de internet para a comunicação entre os dispositivos.
- **Sincronia em tempo real:** mova faders e pads no celular ou no computador; o retorno da DAW depende da configuração de entrada MIDI.
- **Edição e Palco:** organize os faders em uma grade sem sobreposição, personalize cores e controles MIDI e mantenha a mesma ordem no palco.
- **Porta MIDI:** criada automaticamente no macOS; no Windows, conecte o FaderDeck a uma porta criada no loopMIDI.
- **Teste e licença:** 7 dias de avaliação por máquina, acesso com e-mail e senha e recuperação de senha por código enviado por e-mail.

## Instalação e MIDI

Baixe o instalador na página de [Releases](https://github.com/Paylo4002ansatsu/FaderDeck/releases). O aplicativo instalado não exige Node.js.

| Sistema | Requisitos | Configuração MIDI |
| --- | --- | --- |
| **macOS** | Universal: macOS 13+ (Intel e Apple Silicon). Monterey 12: instalador separado para Intel. | A porta virtual **FaderDeck** é criada automaticamente. |
| **Windows** | Windows 64-bit; [loopMIDI](https://www.tobias-erichsen.de/software/loopmidi.html) instalado e em execução. | Crie a porta **FaderDeck** no loopMIDI e selecione-a como saída MIDI no FaderDeck. |

No macOS, permita o acesso à rede local quando solicitado. O app não é assinado/notarizado e pode exigir autorização em **Privacidade e Segurança**. No Windows, o fornecedor do loopMIDI não confirma compatibilidade com Windows 11; consulte seus requisitos atuais.

## Conecte e toque

1. Abra o FaderDeck, entre na sua conta e configure a porta MIDI conforme seu sistema.
2. Conecte computador e celular ou tablet à mesma rede Wi-Fi, sem isolamento entre dispositivos.
3. Clique em **Conectar celular**, leia o QR Code e abra o endereço no navegador.
4. Habilite a entrada **FaderDeck** na DAW e associe os controles usando MIDI Learn.

Para espelhar mudanças da DAW, configure também a entrada MIDI no FaderDeck e o envio de retorno na DAW. Veja o [guia visual para Windows](https://fader-deck.vercel.app/guia-midi-windows.html) para ChurchDAW e Kontakt.

No celular ou tablet, use a Grade para tocar faders e pads e o Palco para exibir somente os faders. A edição e as configurações ficam no computador; a opção de tela cheia depende do suporte do navegador.

> **Rede e acesso:** use uma rede confiável: HTTP/WS não é criptografado, portanto não compartilhe o QR nem exponha a ponte à internet. A autenticação inicial requer internet; o acesso offline depende de uma licença ou avaliação válida em cache e tem tolerância de até 72 horas.

## Desenvolvimento

Requer Node.js 22 ou superior:

```bash
npm install
npm start
npm run check
```

Para a recuperação de senha, configure o template de e-mail do Supabase para incluir `{{ .Token }}`. As notas amigáveis do modal de atualização ficam em `### Destaques para você` no [CHANGELOG.md](CHANGELOG.md).
