# Página do FaderDeck

Esta pasta contém a landing estática do FaderDeck, publicada pela Vercel.

**Página:** <https://fader-deck.vercel.app/>

## Conteúdo

A página apresenta o produto e sua interface real, benefícios, fluxo de configuração, compatibilidade documentada para Windows/macOS, downloads existentes, ofertas comerciais planejadas, perguntas frequentes e informações de rodapé. O Hero recupera a composição visual anterior do modo palco, identificada como ilustração e não como captura real. A captura desktop real está na seção de recursos e mantém sua proporção original; ela mostra explicitamente o estado “SEM PONTE”. Onde faltam capturas adequadas, a página mostra um placeholder dimensionado em 9:19 para o painel no celular.

O teste gratuito de sete dias e a versão completa por R$ 30,00 são apresentados como ofertas planejadas. Não há checkout, ativação, licenciamento ou cadastro implementado nesta etapa; os CTAs informam esse status e não simulam uma compra ou ativação.

## Arquivos

- `index.html`: conteúdo da landing e hrefs existentes de download.
- `styles.css`: estilo visual, responsividade e fontes locais Inter/IBM Plex Mono.
- `app.js`: CTA inteligente, seleção de instalador e menu móvel acessível.
- `platform-detection.js`: detecção de plataforma e arquitetura, preservada.
- `assets/product/`: captura real desktop do painel; estado sem ponte indicado no texto alternativo e na legenda. Capturas pendentes estão marcadas por placeholders com proporções indicadas.
- `guia-midi-windows.html`, `guia-midi-windows.css` e `guia-assets/`: tutorial visual de Windows, folha de estilo externa e capturas associadas.
- `public/faderdeck-icon.png`: ícone de marca publicado também em URL estável para compartilhamento.

## Downloads e compatibilidade

Os links atuais permanecem fixos em `1.0.9`: Windows 64-bit, macOS Universal e macOS Monterey para Intel. O Universal requer macOS Ventura 13 ou posterior. Monterey 12 tem opção somente para Mac Intel. O instalador Windows depende do loopMIDI instalado e ativo para disponibilizar a porta MIDI virtual. No Mac, o aplicativo cria a porta automaticamente. A ajuda documenta somente ChurchDAW e Kontakt; não há promessa de compatibilidade universal.

A seleção automática identifica Windows 64-bit e encaminha macOS/arquiteturas desconhecidas para a escolha manual, preservando os IDs utilizados pelos testes. Não alterar URLs individualmente: para atualizar a versão após confirmar os arquivos da release, execute `npm run update:site-download-version -- 1.2.0` com a tag numérica correspondente.
Durante a preparação de uma nova versão do app, os links e o badge permanecem na última release publicada até que os novos instaladores estejam disponíveis.

## Autenticação e configuração

Os callbacks de confirmação de e-mail e recuperação de senha usam o cliente
`@supabase/supabase-js`, empacotado pelo Vite. Configure `VITE_SUPABASE_URL` e
`VITE_SUPABASE_PUBLISHABLE_KEY` nas variáveis de ambiente de build do Vercel e
no `.env` local (veja `.env.example`). A chave publishable/anon é pública e fica
no bundle do navegador; nunca configure uma chave `secret` ou `service_role`
com o prefixo `VITE_`.

O `vercel.json` constrói a página inicial e o guia do Windows a partir de `docs/` e publica `dist/`. No projeto
Vercel, use a raiz do repositório como diretório do projeto para aplicar essa
configuração.

## Prévia local

```bash
npm run dev:site
```

Abra a URL local apresentada pelo Vite. Para validar o bundle de produção,
execute `npm run build:site`.
