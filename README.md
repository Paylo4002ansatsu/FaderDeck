# FaderDeck para macOS (app desktop)

O FaderDeck vira um app de Mac: ao abrir, ele **sobe a ponte MIDI sozinho**, cria a porta virtual **FaderDeck**, fica na **barra de menus** e mostra o **QR** para conectar o iPhone. Não precisa mais do Terminal.

## 1. Gerar o app (uma vez, no seu Mac)

Requisitos: macOS, **Node.js 22 ou mais novo** (nodejs.org) e as Ferramentas de Linha de Comando do Xcode (`xcode-select --install`, só se o `npm install` pedir).

```bash
cd faderdeck-desktop
npm install
npm start          # teste rápido: abre o app sem instalar
npm run dist       # gera o instalador em release/
```

O `npm run dist` cria `release/FaderDeck-1.0.0-<arquitetura>.dmg` (e um .zip). O app é gerado para a arquitetura do **seu** Mac (Apple Silicon ou Intel). Para um app universal, use `npm run dist:universal`.

> O empacotamento precisa rodar no Mac, porque o módulo MIDI nativo (`@julusian/midi`) usa a versão do macOS.

## 2. Instalar

1. Abra o `.dmg` e arraste **FaderDeck** para **Aplicativos**.
2. Na primeira abertura o macOS pode avisar "desenvolvedor não identificado" (o app não é assinado). Vá em **Ajustes do Sistema → Privacidade e Segurança → Abrir mesmo assim**.
3. Se aparecer "o app está danificado", rode no Terminal:
   ```bash
   xattr -cr /Applications/FaderDeck.app
   codesign --force --deep --sign - /Applications/FaderDeck.app
   ```
4. Aceite o pedido de **rede local / Firewall** (necessário para o iPhone conectar).
5. Na primeira vez, o app pergunta se você já usava a ponte antiga. Se sim, escolha a pasta antiga (com `faderdeck-layout.json` e `.faderdeck-token`, arquivos ocultos: Cmd+Shift+. no Finder) para manter painel e código de pareamento.

## 3. Usar

- **QR do celular, de 4 jeitos:**
  1. **Automático:** ao abrir o app, se nenhum celular reconectar em ~5 segundos, o QR aparece sozinho (na primeira vez ele aparece na hora).
  2. **Botão "Conectar celular"** na barra lateral do painel (acima de "Guia rápido e MIDI Learn"). Em janelas estreitas ele vira um botão flutuante.
  3. **Atalho ⌘K** (ou menu FaderDeck → Conectar celular).
  4. **Ícone na barra de menus** → "Conectar celular (QR)…".
  O QR fecha sozinho quando o celular conecta ("✓ Celular conectado!"), e também com Esc.
- **Ícone na barra de menus:** status, QR, abrir o painel, copiar link, portas MIDI, renovar código, abrir ao iniciar o Mac e sair.
- **DAW (ChurchDAW):** em **Áudio e MIDI**, habilite a entrada **FaderDeck** e use **Mapear MIDI**.
- Fechar a janela **não** encerra o app; use "Sair do FaderDeck" (⌘Q).

## Modo Palco (melhorado na 1.0.2)

- Nome de cada fader (com a cor) no topo e valor embaixo, em letras grandes.
- Folga em cima e embaixo do trilho: o botão do fader não fica mais colado na borda nem na barra de gestos do iPhone, e é maior para pegar com o dedo.
- Celular deitado: páginas só com faders ficam em uma única fileira, com trilhos mais longos. Em retrato, até 4 colunas.
- Botão **Sair** com o texto correto, numa faixa própria no topo, junto das bolinhas de página.

## Onde ficam os dados

`~/Library/Application Support/FaderDeck/` (menu: "Mostrar pasta de dados"): `faderdeck-layout.json` (painel) e `.faderdeck-token` (código). Atualizar ou reinstalar o app **não apaga** esses arquivos. Faça backup copiando essa pasta.

## Modo terminal (opcional)

`npm run bridge` roda só a ponte, como antes. Nesse modo os dados ficam na própria pasta do projeto.

## Se algo falhar

Abra o **Claude Code** na pasta `faderdeck-desktop` e cole:

```
Este é um app Electron (main.js) que embute a ponte server.cjs. Rode "npm install" e "npm run dist" neste Mac, corrija qualquer erro de build ou de execução (módulo @julusian/midi, assinatura, permissões de rede) sem mudar o comportamento atual, confirme que o app abre, cria a porta MIDI virtual "FaderDeck" e responde em http://127.0.0.1:8787/, e me diga o que mudou.
```

## Troque o ícone

Substitua `build/icon.png` (1024×1024) pelo seu ícone e rode `npm run dist` de novo.
