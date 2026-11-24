# Página do FaderDeck

Esta pasta contém a landing estática do FaderDeck, publicada pelo GitHub Pages a partir de `/docs` na branch `main`.

**Página:** <https://paylo4002ansatsu.github.io/FaderDeck/>

## Conteúdo

A página apresenta o produto e sua interface real, benefícios, fluxo de configuração, compatibilidade documentada para Windows/macOS, downloads existentes, ofertas comerciais planejadas, perguntas frequentes e informações de rodapé. A captura desktop e a captura móvel estão em `assets/product/`; ambas foram feitas do cliente real e mostram explicitamente o estado “SEM PONTE”. A seção de pads é identificada como espaço reservado, pois não há captura real dessa interface disponível na pasta do site.

O teste gratuito de sete dias e a versão completa por R$ 30,00 são apresentados como ofertas planejadas. Não há checkout, ativação, licenciamento ou cadastro implementado nesta etapa; os CTAs informam esse status e não simulam uma compra ou ativação.

## Arquivos

- `index.html`: conteúdo da landing e hrefs existentes de download.
- `styles.css`: estilo visual, responsividade e fontes locais Inter/IBM Plex Mono.
- `app.js`: CTA inteligente, seleção de instalador e menu móvel acessível.
- `platform-detection.js`: detecção de plataforma e arquitetura, preservada.
- `assets/product/`: capturas reais do painel desktop e mobile; estado sem ponte indicado no texto alternativo e na legenda.
- `guia-midi-windows.html` e `guia-assets/`: tutorial visual de Windows e capturas associadas.
- `faderdeck-icon.png`: ícone de marca usado na página.

## Downloads e compatibilidade

Os links atuais permanecem fixos em `1.0.4`: Windows 64-bit, macOS Universal e macOS Monterey para Intel. O Universal requer macOS Ventura 13 ou posterior. Monterey 12 tem opção somente para Mac Intel. O instalador Windows depende do loopMIDI instalado e ativo para disponibilizar a porta MIDI virtual. No Mac, o aplicativo cria a porta automaticamente. As DAWs não são anunciadas como universalmente compatíveis.

A seleção automática identifica Windows 64-bit e encaminha macOS/arquiteturas desconhecidas para a escolha manual, preservando os IDs utilizados pelos testes. Não alterar URLs individualmente: para atualizar a versão após confirmar os arquivos da release, execute `npm run update:site-download-version -- 1.2.0` com a tag numérica correspondente.

## Prévia local

Na raiz do repositório, inicie um servidor estático:

```bash
python3 -m http.server 8000 --directory docs
```

Abra <http://localhost:8000/>. A landing não exige dependências de frontend.
