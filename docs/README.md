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
- `app.js`: seleção do CTA, atualização das opções de download e interações do menu móvel. As URLs dos instaladores são literais e sincronizadas pelo script de release.
- `platform-detection.js`: detecção de plataforma e arquitetura. Windows 64-bit recebe o instalador x64; Windows 32-bit recebe um aviso e não pode baixar o executável incompatível. O pacote macOS é universal para Intel e Apple Silicon; quando o navegador não expõe o chip, o site mantém essa opção universal sem adivinhar.
- `styles.css`: layout, cores e comportamento responsivo.
- `faderdeck-icon.png`: ícone usado pela página.

Os caminhos dos recursos são relativos (`styles.css`, `platform-detection.js`, `app.js` e `faderdeck-icon.png`) para funcionarem no endereço de projeto `/FaderDeck/`.

## Atualizar e publicar

1. As releases históricas podem conter apenas um sistema: Windows `1.0.0` e macOS `1.0.1`. As próximas versões criadas pelo workflow devem conter os dois instaladores na mesma Release.
2. Hoje, o link Windows é `https://github.com/Paylo4002ansatsu/FaderDeck/releases/download/1.0.4/FaderDeck-Windows-Setup.exe` e o link macOS é `https://github.com/Paylo4002ansatsu/FaderDeck/releases/download/1.0.4/FaderDeck-Mac.dmg`. As tags são numéricas, sem prefixo `v`.
3. O site oferece o instalador Windows x64 apenas quando o navegador identifica um sistema de 64 bits; em Windows 32-bit, desativa o download e informa a incompatibilidade. Para Macs, um único instalador universal funciona em Intel e Apple Silicon.
4. Para atualizar os links manualmente, depois de confirmar que a Release inclui ambos os arquivos, execute `npm run update:site-download-version -- 1.2.0`, substituindo `1.2.0` pela tag publicada. O script sincroniza `index.html`, `app.js` e este README.
5. Antes de criar a tag, alinhe `package.json` e `package-lock.json` à mesma versão, por exemplo `npm version 1.0.2 --no-git-tag-version`; faça commit e envie a `main`. O workflow verifica que a tag corresponde à versão do app.
6. Crie e envie a tag numérica correspondente, por exemplo `git tag 1.0.2 && git push origin 1.0.2`. O workflow gera Windows e macOS; somente após os dois builds passarem, publica os assets juntos e atualiza os dois links do site.
7. Não crie uma Release separada por sistema para as versões novas: ambos os links usam a mesma tag explícita, evitando apontar para uma Release sem o instalador da outra plataforma.
8. O GitHub Pages publica automaticamente a pasta `/docs` da branch `main`; não é necessário copiar a página para a raiz do aplicativo.

Para uma prévia local, inicie um servidor estático na raiz do repositório, por exemplo:

```bash
python3 -m http.server 8000 --directory docs
```

Depois abra <http://localhost:8000/> no navegador. Não há dependências de frontend para a landing page.
