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
2. A release Windows mais recente disponível é `1.0.0`; os dois botões e este README já apontam para `https://github.com/Paylo4002ansatsu/FaderDeck/releases/download/1.0.0/FaderDeck-Windows-Setup.exe`. Não acrescente `v` à tag.
3. O botão macOS aponta para `https://github.com/Paylo4002ansatsu/FaderDeck/releases/latest/download/FaderDeck-Mac.dmg`.
4. Para atualizar a versão Windows manualmente, execute `npm run update:site-download-version -- 1.2.0`, substituindo `1.2.0` pela tag numérica da release já publicada. O script atualiza `index.html`, `app.js` e este README; depois faça commit e envie para `main`.
5. Para releases futuras, o workflow de build executa o mesmo script depois que o build de Windows e macOS conclui e a GitHub Release foi criada. O job envia os arquivos atualizados para `main`; não crie tag com prefixo `v`.
6. O GitHub Pages publica automaticamente a pasta `/docs` da branch `main`; não é necessário copiar a página para a raiz do aplicativo.

Para uma prévia local, inicie um servidor estático na raiz do repositório, por exemplo:

```bash
python3 -m http.server 8000 --directory docs
```

Depois abra <http://localhost:8000/> no navegador. Não há dependências de frontend para a landing page.
