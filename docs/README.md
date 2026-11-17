# Landing page FaderDeck

Landing page estática, sem dependências de frontend, em português brasileiro. O conteúdo do produto e os requisitos foram redigidos a partir do README do FaderDeck.

## Executar localmente

Requer Python 3 para o servidor de preview incluído:

```bash
npm run dev
```

Para gerar os arquivos publicáveis:

```bash
npm run build
```

O build copia os arquivos estáticos para `dist/`. Hospede o conteúdo de `dist/` em qualquer provedor de hospedagem estática.

## URLs dos instaladores

O CTA principal detecta o sistema operacional e encaminha para o instalador correspondente. O Windows está configurado para `https://github.com/Paylo4002ansatsu/FaderDeck/releases/download/1.0.0/FaderDeck-Windows-Setup.exe` e o macOS para `https://github.com/Paylo4002ansatsu/FaderDeck/releases/latest/download/FaderDeck-Mac.dmg`. Os botões de download alternativo usam as mesmas URLs.
