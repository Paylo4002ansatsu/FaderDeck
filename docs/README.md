# Página do FaderDeck

Esta pasta contém os arquivos estáticos da landing page pública do FaderDeck. O GitHub Pages publica diretamente desta pasta na branch `main`.

**Página:** <https://paylo4002ansatsu.github.io/FaderDeck/>

## O que a página apresenta

- O FaderDeck como controlador MIDI para DAW, com painel de faders e pads.
- A ponte MIDI integrada e a conexão do celular por QR na mesma rede Wi-Fi.
- A porta MIDI virtual FaderDeck no macOS, a barra de menus e o comportamento da janela.
- Os instaladores disponíveis para Windows e macOS, os requisitos de macOS e os avisos de primeira abertura/rede.

## Arquivos

- `index.html`: conteúdo e marcação da página, incluindo os href fixos dos botões de download.
- `app.js`: detecção do sistema operacional, CTA principal e interações do menu móvel. O endereço Windows é literal; não gere a tag de versão nem sobrescreva o botão Windows alternativo.
- `styles.css`: layout, cores e comportamento responsivo.
- `logo.svg`: ícone usado pela página.

Os caminhos dos recursos são relativos (`styles.css`, `app.js` e `logo.svg`) para funcionarem no endereço de projeto `/FaderDeck/`.

## Atualizar e publicar

1. Edite os arquivos necessários dentro de `docs/`.
2. Mantenha o endereço Windows idêntico nos dois locais: `index.html` (botão `download-windows`) e `app.js` (CTA inteligente para Windows). O endereço atual é `https://github.com/Paylo4002ansatsu/FaderDeck/releases/download/1.0.0/FaderDeck-Windows-Setup.exe`.
3. O botão macOS aponta para `https://github.com/Paylo4002ansatsu/FaderDeck/releases/latest/download/FaderDeck-Mac.dmg`.
4. Faça commit e envie as alterações para `main`. O GitHub Pages publica automaticamente a pasta `/docs` da branch `main`; não é necessário copiar a página para a raiz do aplicativo.

Para uma prévia local, inicie um servidor estático na raiz do repositório, por exemplo:

```bash
python3 -m http.server 8000 --directory docs
```

Depois abra <http://localhost:8000/> no navegador. Não há dependências de frontend para a landing page.
