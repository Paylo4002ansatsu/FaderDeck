# Supabase — preparação técnica

Este diretório prepara a integração comercial futura. A migration SQL inicial foi
criada após aprovação do modelo e aplicada ao banco local e ao projeto Supabase
remoto. Nenhuma Edge Function executável, pagamento ou ativação foi implementada.

## Auditoria e estado atual

- O site é HTML/CSS/JavaScript estático em `docs/`, empacotado pelo Vite. O bundle
  usa `@supabase/supabase-js` somente para processar callbacks de confirmação e
  recuperação de senha; não implementa cadastro público, compra ou licenciamento.
- O desktop é Electron. O processo principal abre uma janela com `contextIsolation`,
  `sandbox` e `nodeIntegration: false`; o painel web é servido pela ponte local em
  `server.cjs`. A comunicação MIDI e o servidor local não fazem parte desta integração.
- A Supabase CLI 3.4.0 está declarada como dependência de desenvolvimento local.
  Execute `npx supabase --version`.
- Esta versão da CLI usa `supabase/config.jsonc`. A saída de `supabase init --help`
  confirma que `supabase init --force` substitui esse arquivo e remove configurações
  antigas como `config.toml`. Por isso, o JSONC existente foi preservado em vez de
  criar um segundo arquivo de configuração concorrente.
- A configuração local tem `auth.enable_signup = false`, confirmação de e-mail
  obrigatória e requisitos reforçados para senhas e troca de senha. Isto não altera
  a configuração hospedada; revise e configure essas opções separadamente no painel
  do projeto remoto antes de habilitar Auth.
- O projeto Supabase remoto aparece vinculado neste checkout e a CLI autenticada
  consegue listá-lo como `ACTIVE_HEALTHY`. A migration foi aplicada ao projeto
  remoto após autorização explícita. Nenhuma configuração de Auth ou função remota
  foi alterada.
- Podman está instalado e a stack local está ativa com Postgres e Auth. Os
  serviços não necessários a esta validação não foram iniciados. `db lint` não
  encontrou erros no schema `public`.
- A inspeção do catálogo local confirmou RLS nas seis tabelas, seis políticas
  apenas para `authenticated`, nenhum grant para `anon` e nenhuma permissão de
  escrita para `authenticated`.
- Não há arquivo de seed nem dados de teste de clientes, vendas ou administradores.
  A configuração local de seed está desativada.
- `.temp/` contém metadados locais de vínculo e permanece ignorado pelo Git.

## Variáveis de ambiente

`.env.example` lista `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e
`SUPABASE_SECRET_KEY` sem valores para o backend local. Também documenta
`VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` para o site; estas duas
variáveis são intencionalmente públicas e são incluídas no bundle do navegador.
Configure-as no ambiente de build do Vercel e no `.env` local. Arquivos `.env`
são ignorados pelo Git.

O site e o Electron **nunca** recebem a chave secreta. A chave publishable/anon é
projetada para uso público no cliente; autorizações e acesso a dados continuam
protegidos por RLS. A chave secreta fica somente em um backend confiável, como
Edge Functions, e não deve ser incluída no renderer, em `docs/`, em `client/`,
em builds Electron nem em variáveis de frontend como `VITE_*` ou `NEXT_PUBLIC_*`.

Para configurar o CLI em outra máquina:

1. Instale Docker Desktop ou Podman para executar a stack local.
2. Execute `npx supabase login` no terminal e autentique-se pelo fluxo do CLI.
3. Execute `npx supabase link --project-ref <project-ref>`. Se solicitado, informe
   a senha do banco somente no prompt local seguro; não a coloque no chat, no Git
   ou em argumentos salvos no histórico.
4. Configure chaves de runtime somente no ambiente apropriado. Para Edge Functions,
   use o armazenamento de secrets do Supabase CLI após aprovação; não grave a chave
   secreta no `.env` do site nem no app Electron.
5. `npx supabase projects list` é uma verificação de leitura. Não execute
   `db push`, `migration up`, `functions deploy` ou mudanças de Auth em produção
   sem revisão e autorização explícita.

## Modelo de dados aprovado para a migration inicial

O modelo e as políticas RLS abaixo foram aprovados para a migration inicial.
**As tabelas estão versionadas e criadas nos bancos local e remoto.** A migration
não habilita cadastro público nem cria dados fictícios.

| Entidade         | Campos/relacionamentos implementados                                                                                                                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `customers`      | `id`, e-mail normalizado e único, `auth_user_id` opcional e único para vincular uma identidade autenticada, timestamps. Não duplicar perfil ou dados de cobrança sem necessidade.                                      |
| `orders`         | `id`, `customer_id`, provedor, identificador do pedido no provedor, valor em unidade menor (centavos), moeda, estado e timestamps. Estado de pagamento só é alterado por backend confiável após validação do provedor. |
| `licenses`       | `id`, `customer_id`, `order_id` opcional, código do produto, estado e período de validade. Não guardar chave secreta ou token de ativação em texto puro.                                                               |
| `devices`        | `id`, `license_id`, hash de identificador criado pelo app, rótulo opcional, primeira/última ativação e revogação. Não guardar serial de hardware nem IP sem requisito confirmado.                                      |
| `trials`         | `id`, `customer_id` único, início, fim e estado. Uma regra de unicidade por cliente evita múltiplos trials associados ao mesmo registro.                                                                               |
| `admin_profiles` | `user_id` como PK/FK para `auth.users`, papel administrativo fixo e timestamp. Sem cadastro público ou autoelevação de privilégio.                                                                                     |

### Relações e índices implementados

- `orders.customer_id` → `customers.id`; índice composto por cliente e data.
- `licenses.customer_id` → `customers.id`; `licenses.order_id` → `orders.id`
  opcional; índices por cliente/estado e por pedido.
- `devices.license_id` → `licenses.id`; índice único por licença e hash do
  dispositivo, além de índice para consultar dispositivos não revogados.
- `trials.customer_id` → `customers.id` com unicidade; índice por estado e fim.
- `admin_profiles.user_id` → `auth.users.id` como chave primária.
- E-mail guardado em forma normalizada e índice único sobre `lower(email)`;
  `customers.auth_user_id` tem unicidade quando preenchido (PostgreSQL permite
  vários valores nulos no índice único).
- Chave primária UUID em cada entidade; timestamps sem dados de pagamento
  completos, payloads brutos ou identificadores de hardware.

`auth.users` é uma dependência específica do Supabase Auth. Para portar a outro
PostgreSQL/provedor de identidade, substituir essa referência por uma abstração
de identidade e migrar as contas pelo fluxo apropriado; não exportar credenciais
ou hashes de senha como dados comuns.

## RLS e autenticação administrativa

- Habilitar RLS em todas as tabelas no schema `public`; não criar políticas para
  `anon` nem grants públicos.
- `admin_profiles`: usuário autenticado pode ler somente o próprio perfil.
  Inserção, remoção e alteração de papéis ficam fora do cliente e nunca permitem
  autoelevação.
- `customers`: o cliente autenticado pode ler o próprio registro quando
  `auth_user_id = auth.uid()`; administradores validados podem ler registros para
  gestão. Criação/vinculação é responsabilidade do backend.
- `orders`, `licenses`, `trials` e `devices`: leitura limitada ao cliente
  correspondente ou a um administrador validado; sem escrita direta pelo cliente.
  Criação, extensão, ativação e revogação ocorrem somente pelo backend confiável.
- Dados administrativos exigem identidade autenticada e papel validado em
  `admin_profiles`. A função `public.is_admin()` usa `SECURITY DEFINER` com
  `search_path` vazio e concede somente leitura administrativa por meio das
  policies; ela não permite autoelevação.
- Edge Functions com chave secreta ignoram RLS por privilégio elevado; cada função
  deverá validar o JWT e autorizar a operação explicitamente. A chave nunca é um
  substituto da autorização.

### Provisionamento futuro do primeiro administrador

1. Manter cadastro público desligado no projeto remoto e exigir confirmação de
   identidade/e-mail.
2. Convidar o administrador escolhido pelo painel autenticado do Supabase Auth;
   não criar uma rota pública de promoção nem inserir usuários diretamente em
   `auth.users`.
3. Depois que o convite for aceito, obter o UUID pela interface administrativa
   segura e inserir somente esse UUID em `admin_profiles` usando o SQL Editor
   autenticado. O SQL exato será preparado junto da migration aprovada.
4. Confirmar que o administrador consegue autenticar e que um usuário sem perfil
   não consegue consultar dados administrativos.

Nenhuma conta ou dado de cliente foi criado nesta preparação.

## Migrations e Edge Functions

- `migrations/20261126013802_initial_commercial_schema.sql` define as seis tabelas,
  chaves estrangeiras, índices, função de autorização administrativa, gatilhos de
  `updated_at`, RLS e grants. O papel `authenticated` só recebe leitura filtrada
  por RLS; escrita é reservada ao backend confiável com `service_role`.
- `migrations/20261126025315_restrict_is_admin_anon_execution.sql` revoga o
  privilégio `EXECUTE` de `anon` em `public.is_admin()`. Essa migration incremental
  foi aplicada ao projeto remoto após a auditoria do ACL hospedado e autorização
  explícita.
- A migration foi aplicada e validada no banco local com `npx supabase db lint
--schema public --fail-on error`, e aplicada ao remoto após autorização. O
  histórico remoto confirma a migration; não há seed nem funções para publicar.
- `functions/` contém apenas notas de planejamento. Não há stubs nem endpoints
  fictícios. Os nomes candidatos, ainda sem implementação, estão em
  [`functions/README.md`](./functions/README.md).
- Separar regras do domínio (pedido, trial, licença, dispositivo) dos adaptadores
  Auth, pagamentos e provedores. Pagamento e liberação de licenças estão fora
  desta etapa.

## Testes locais de banco e RLS

Os testes pgTAP em `supabase/tests/database/` exercitam as migrations aplicadas ao banco
local, sem acessar o projeto remoto. As fixtures de `auth.users` e das tabelas
comerciais são criadas dentro de uma transação e revertidas ao final.

Requisitos: Docker Desktop ou Podman configurado como runtime de containers e
dependências instaladas com `npm ci`.
Para iniciar a stack e executar os testes:

```sh
npx supabase start
npm run test:db
```

O teste confirma a ACL de `public.is_admin()`, o resultado para usuário comum e
administrador, visibilidade por RLS e bloqueio das operações de escrita para
`anon` e `authenticated` (inclusive administrador, conforme os grants atuais).
Não use `supabase test db --remote` para esses testes.

O workflow de pull request inicia a stack local e executa `npm run test:db`
antes dos testes Node. Em runners próprios, o serviço Docker precisa estar
disponível. A stack pode ser encerrada localmente com `npx supabase stop`.

## Exportação e portabilidade

Após configurar uma URL de conexão de banco em terminal confiável, uma exportação
PostgreSQL padrão poderá ser feita com:

```sh
pg_dump --format=custom --schema=public "$DATABASE_URL" --file=faderdeck-public.dump
```

Para restaurar em outra instância PostgreSQL compatível:

```sh
pg_restore --no-owner --no-privileges --dbname="$TARGET_DATABASE_URL" faderdeck-public.dump
```

Revise primeiro extensões, políticas, funções e dependências do schema `auth`.
Migrations devem preferir SQL PostgreSQL padrão; objetos que dependem do Supabase
(Auth/Edge Functions) devem ficar isolados e ser adaptados durante uma migração.
Não exportar nem compartilhar dumps sem proteção: podem conter dados pessoais.

## Próximas etapas

1. Revisar o resultado local da migration e as seis policies RLS.
2. Expandir os testes pgTAP junto com novas policies ou mudanças de grants; os
   usuários e registros usados pelos testes são fictícios e revertidos na
   transação.
3. Alterações remotas futuras, inclusive Auth, Edge Functions, pagamentos ou
   licenciamento, exigem revisão e autorização próprias.
