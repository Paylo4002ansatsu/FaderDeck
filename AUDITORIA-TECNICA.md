# Auditoria técnica do FaderDeck

**Data:** 17 de novembro de 2026
**Escopo:** aplicativo Electron, ponte HTTP/WebSocket/MIDI, pacote standalone e workflow Windows.

## Resumo

A revisão se concentrou no ciclo de vida do servidor, validação de entradas, concorrência ao salvar layouts, navegação do Electron e consistência do pacote distribuível da ponte. Foram adicionados seis testes automatizados; todos passaram, assim como a validação do ZIP.

## Achados e mudanças

| Área | Problema encontrado | Mudança aplicada |
|---|---|---|
| Inicialização/portas | O servidor iniciava ao ser importado, e a sondagem de porta do Electron tinha uma janela de corrida. | `start()` e `stop()` explícitos; o servidor escolhe a porta pelo próprio bind e tenta as seguintes se a inicial estiver ocupada. Electron aguarda o início. |
| HTTP/WebSocket | Targets malformados podiam falhar sem resposta consistente; corpos eram contados por caracteres e JSON/tamanho podiam resultar em erro 500. | Parsing inválido retorna 400; upgrade WS é rejeitado; limite de corpo de 16 KiB por bytes; JSON inválido retorna 400, excesso retorna 413 e falha interna não expõe a exceção ao cliente. |
| Persistência | Gravações concorrentes podiam sobrescrever um layout mais recente; o encerramento escrevia sincronamente. | Fila serial e gravação atômica em arquivo temporário seguido de `rename`, usadas por PUT, debounce e shutdown. |
| Electron | A janela não restringia de forma explícita a navegação e popups; falhas de abertura podiam passar despercebidas. | Navegação limitada à origem local/porta exatas; popups negados; URLs externas apenas HTTP(S); erros visíveis e timers limpos ao sair. |
| Distribuição da ponte | ZIP e README podiam ficar desatualizados; faltava manifesto isolado e garantia de incluir o painel. | Gerador reproduzível valida integridade e entradas obrigatórias, sempre inclui `client/`, não aninha a pasta de downloads e usa manifesto/lockfile próprios. |
| CI/empacotamento | O workflow estava em `github/workflows`, que não é lido pelo GitHub Actions; o empacotamento não declarava o unpack do módulo MIDI nativo. | Workflow movido para `.github/workflows`, com `npm ci`, testes e anexação do instalador/ZIP como artefatos da execução do Actions. ASAR habilitado e `@julusian/midi` incluído em `asarUnpack`. |
| Higiene do repositório | `.gitignore` não protegia todos os dados locais e artefatos temporários. | Regras para dependências, builds, token/layout local, cache Python, logs e temporários. |

## Arquivos alterados

Foram modificados `.gitignore`, `README.md`, `README-ponte.md`, `main.js`, `server.cjs`, `package.json` e `package-lock.json`; criados `server-utils.cjs`, `electron-utils.cjs`, `fader-bridge/package.json`, `fader-bridge/package-lock.json`, `scripts/package-bridge.py`, `scripts/package-bridge.cjs`, `tests/server.test.cjs` e `tests/electron-utils.test.cjs`; o workflow foi movido para `.github/workflows/build-windows.yml`. Também foi regenerado `client/downloads/fader-bridge.zip` e criado este relatório.

## Validação

`npm ci --ignore-scripts` concluiu e confirmou compatibilidade do lockfile. `npm test` passou com **6/6 testes**: segurança de origem/protocolo Electron, parsing de target, fila serial, escrita atômica, ausência de listen ao importar, retry de porta ocupada, JSON inválido, limite de corpo e bloqueio de rotação de token sem Origin/cabeçalho autorizado. `node --check` nos módulos/testes e `python3 -m py_compile scripts/package-bridge.py` também passaram.

`npm run package:bridge` gerou o ZIP; `unzip -t` confirmou integridade. O pacote tem 28 entradas e inclui `client/index.html`, servidor/helpers, manifesto, lockfile e README. `npm audit --omit=dev` reportou **zero vulnerabilidades** nas dependências de runtime.

## Riscos restantes e limitações

O `npm audit` completo reporta **6 vulnerabilidades moderadas** na cadeia de build (`electron-builder` e dependências transitivas, incluindo `minimatch`), sem alertas altos/críticos. O reparo automático sugerido pelo npm implica downgrade major do `electron-builder`; não o apliquei sem validar compatibilidade.

Não foi produzido `.dmg` nem instalador Windows no sandbox Linux. A build de distribuição precisa ser validada nos runners/plataformas de destino, especialmente por causa do módulo MIDI nativo. Os testes usam um stub de `@julusian/midi`; não substituem testes reais com porta virtual, DAW, rede Wi-Fi ou iPhone. O projeto não define lint/formatter no `package.json`, portanto foram executados testes Node e verificações de sintaxe.
