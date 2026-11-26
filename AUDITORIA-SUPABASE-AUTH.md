# Auditoria do Supabase Auth e provisionamento do primeiro administrador

## 1. Resumo executivo

O schema comercial está aplicado no projeto Supabase remoto: a listagem somente
de leitura encontrou a migration local e remota `20261126013802`. Uma consulta
remota agregada, sem retornar dados pessoais, encontrou **0 usuários em
`auth.users`, 0 perfis em `admin_profiles` e 0 clientes**. Portanto, **não
existe primeiro administrador provisionado**.

Não foi possível confirmar as configurações de Auth hospedadas. O Dashboard
redirecionou para autenticação GitHub e as chamadas da API de gerenciamento
retornaram `401`; não foram solicitadas credenciais nem alterado o estado
hospedado. Assim, **não é possível declarar o Supabase Auth hospedado pronto**.

Localmente, as opções documentadas são restritivas: cadastro público e login
anônimo estão desativados; confirmação de e-mail e requisitos fortes de senha
estão ativados. Essas opções pertencem a `supabase/config.jsonc` e **não
comprovam** a configuração da hospedagem.

Nenhum administrador foi criado. Após o pedido “Fix all issues” e autorização
explícita separada para a produção, a migration incremental
`20261126025315_restrict_is_admin_anon_execution.sql` foi aplicada. A verificação
remota confirmou que `anon` não pode mais executar `public.is_admin()` e que
`authenticated` continua autorizado. Nenhuma configuração de Auth, usuário,
policy ou dado foi alterado.

## 2. Escopo, método e arquivos examinados

Foram examinados:

| Arquivo | Responsabilidade |
|---|---|
| `supabase/config.jsonc` | Configuração local de Auth, URLs de redirecionamento, e-mail, SMTP local e MFA. |
| `supabase/migrations/20261126013802_initial_commercial_schema.sql` | Schema comercial, relacionamentos, grants, RLS e `is_admin()`. |
| `supabase/functions/README.md` | Planejamento das Edge Functions; não há funções executáveis. |
| `.env.example` | Nomes de variáveis, sem valores de credenciais. |
| `package.json` | Dependências e scripts; a CLI Supabase é de desenvolvimento, não há SDK Supabase de runtime. |
| `supabase/README.md` | Documentação de configuração, modelo aprovado, RLS e provisionamento futuro. |
| `client/`, `bridge/`, `docs/` | Busca por integração Supabase e fluxos de autenticação comercial. |

Verificações remotas somente de leitura:

- `supabase db query --remote --read-only` consultou apenas contagens agregadas
  das tabelas `auth.users`, `public.admin_profiles` e `public.customers`.
- Consultas de catálogo somente de leitura verificaram RLS, policies, grants
  efetivos e ACL de `public.is_admin()` no remoto.
- `supabase migration list --linked` comparou o histórico local e remoto.
- A listagem do projeto pela CLI confirmou acesso ao projeto vinculado e seu
  estado `ACTIVE_HEALTHY`. Isso não valida as opções de Auth.
- A tentativa de leitura pelo Dashboard exigiu autenticação GitHub; sem uma
  sessão autenticada, as configurações da API de gerenciamento não puderam ser
  lidas.

Nenhuma chave, token, senha, e-mail ou identificador pessoal foi incluído neste
relatório.

## 3. Situação da autenticação local

As opções abaixo são **locais**, não uma descrição do projeto hospedado:

| Opção | Valor local observado | Referência |
|---|---|---|
| Auth e provedor de e-mail | Habilitados | `supabase/config.jsonc` |
| Cadastro público | Desabilitado | `supabase/config.jsonc:206` |
| Login anônimo | Desabilitado | `supabase/config.jsonc:208` |
| Confirmação de e-mail | Obrigatória | `supabase/config.jsonc:261` |
| Política de senha | Mínimo de 8 caracteres; letras maiúsculas e minúsculas, dígitos e símbolos | `supabase/config.jsonc:212-215` |
| Alteração segura de senha | Reautenticação e senha atual exigidas conforme configuração | `supabase/config.jsonc:263-266` |
| URLs | `127.0.0.1:3000`, apenas para desenvolvimento local | `supabase/config.jsonc:189-193` |
| SMTP próprio | Bloco SMTP comentado; não configurado localmente | `supabase/config.jsonc:275-283` |
| SMTP de teste local | `local_smtp` habilitado; isso não configura SMTP hospedado | `supabase/config.jsonc:122-126` |
| MFA local | Fatores TOTP e telefone desabilitados | `supabase/config.jsonc`, seção `auth.mfa` |

As URLs locais não devem ser tratadas como URLs de produção. Também não há
fluxo de login, cadastro, recuperação de senha ou confirmação via Supabase Auth
implementado na aplicação comercial. A busca no código da aplicação não
encontrou cliente Supabase de runtime nem chamadas a Auth. O app Electron
continua voltado à ponte MIDI local, sem integração comercial com Auth.

## 4. Situação da autenticação hospedada

| Verificação | Resultado |
|---|---|
| Projeto vinculado / acessível pela CLI | Confirmado; projeto listado como `ACTIVE_HEALTHY`. |
| Migration inicial aplicada | Confirmado: versão `20261126013802` consta nos históricos local e remoto. |
| Correção do privilégio de `anon` | Migration `20261126025315` aplicada e confirmada no histórico remoto. |
| Usuários em `auth.users` | **0**, confirmado por contagem agregada somente de leitura. |
| Administradores em `admin_profiles` | **0**, confirmado por contagem agregada somente de leitura. |
| Clientes em `public.customers` | **0**, confirmado por contagem agregada somente de leitura. |
| Provedor de e-mail habilitado no projeto hospedado | **NÃO VERIFICADO**; requer leitura autenticada do Dashboard/API. |
| Confirmação obrigatória de e-mail | **NÃO VERIFICADO** no projeto hospedado. |
| Cadastro público e login anônimo | **NÃO VERIFICADO** no projeto hospedado. |
| Política de senha, MFA e limites de tentativas | **NÃO VERIFICADO** no projeto hospedado. |
| SMTP próprio | **NÃO VERIFICADO** no projeto hospedado. |
| Site URL e allow-list de redirecionamentos | **NÃO VERIFICADO** no projeto hospedado. |
| Administrador provisionado | **Não existe atualmente**, conforme contagens acima. |

A ausência de linhas em `auth.users` não prova que o cadastro público esteja
desabilitado. A configuração local também não serve como evidência do estado
hospedado.

Para verificar as opções não acessíveis, um operador autorizado deve abrir o
projeto correto no Supabase Dashboard e revisar **Authentication → Providers**,
**Authentication → URL Configuration**, as configurações de e-mail/SMTP e as
opções de segurança/MFA. Nenhuma alteração deve ser salva durante essa
verificação.

## 5. Tabelas, RLS e permissões

A migration define `customers`, `orders`, `licenses`, `devices`, `trials` e
`admin_profiles`, com chaves estrangeiras e índices para as relações
comerciais. O histórico da migration confirma que essa versão está aplicada no
remoto.

As seis tabelas têm RLS habilitado no remoto, cada uma com uma policy `SELECT`
para `authenticated`. A inspeção dos grants efetivos confirmou que `anon` não
tem privilégios nessas tabelas, `authenticated` tem somente `SELECT` e
`service_role` tem DML. As policies permitem a leitura do próprio registro do
cliente e dos dados comerciais associados, ou a leitura administrativa
validada por `is_admin()`. A role privilegiada `service_role` deve permanecer
em ambiente confiável, fora do renderer, navegador e Electron distribuído.

Não foi encontrada policy de escrita para `admin_profiles` nem caminho de
autoelevação de um usuário autenticado. Não foi executado teste comportamental
com contas, pois isso exigiria criar usuários, ação fora do escopo autorizado.

## 6. `admin_profiles` e `is_admin()`

- `admin_profiles.user_id` é chave primária e chave estrangeira para
  `auth.users(id)`; o papel é fixo como `admin`.
- Usuários autenticados podem consultar somente o próprio perfil. A migration
  revoga os privilégios gerais e não concede `INSERT`, `UPDATE` ou `DELETE` a
  `authenticated`.
- A escrita fica restrita à role privilegiada. Portanto, um usuário comum não
  pode inserir ou alterar o próprio perfil pelo Data API.
- `is_admin()` é `SECURITY DEFINER`, define `search_path` vazio e compara
  `auth.uid()` com um perfil de papel `admin`.
- **Achado corrigido:** antes da correção, a ACL hospedada concedia
  `EXECUTE` explicitamente a `anon` (`anon=X/postgres`), apesar da intenção
  restritiva da migration inicial. A migration incremental
  `20261126025315_restrict_is_admin_anon_execution.sql` foi aplicada após
  autorização explícita. A consulta posterior confirmou
  `anon_can_execute = false` e `authenticated_can_execute = true`; a função
  continua `SECURITY DEFINER` com `search_path` vazio. Não foi demonstrado
  acesso anônimo a dados nem autoelevação.
- Não há usuário ou perfil administrativo remoto atualmente.
- A migration não define tabela ou mecanismo persistente de auditoria para
  provisionamentos ou ações administrativas.

Não foi encontrado caminho de autoelevação pelo cliente. A role que executa
operações privilegiadas continua sendo um limite de confiança: suas credenciais
não podem ser distribuídas com a aplicação. Como a migration inicial já foi
aplicada, a correção foi feita em uma migration incremental, sem reescrever o
histórico, e aplicada no remoto após autorização explícita.

## 7. Achados e classificação

Os itens abaixo incluem pendências de prontidão/observabilidade e uma
permissão excessiva de baixo impacto. Não foi confirmado acesso anônimo aos
dados comerciais nem autoelevação.

| Classificação | Achado | Impacto |
|---|---|---|
| **ALTA** | Não existe conta Auth nem perfil administrativo remoto. | Não há acesso administrativo comercial disponível; a operação não está pronta. |
| **NÃO VERIFICADA** | Configurações de Auth hospedadas não puderam ser consultadas. | Não é possível confirmar bloqueio de cadastro público, confirmação de e-mail, política de senha, SMTP, redirects ou MFA. |
| **BAIXA — CORRIGIDA** | A role `anon` tinha `EXECUTE` em `public.is_admin()` no remoto, apesar da intenção restritiva da migration. | Permissão desnecessária em função `SECURITY DEFINER`; revogada pela migration incremental e verificada no remoto. |
| **MÉDIA** | Não há trilha de auditoria persistente para provisionamento/ações administrativas. | Investigações e atribuição de ações dependeriam de registros operacionais externos. |
| **MÉDIA — planejado** | Não há fluxo Supabase Auth na aplicação nem Edge Functions executáveis. | Cadastro, login, recuperação e gestão comercial ainda não estão implementados; pagamentos/licenças seguem fora do escopo. |

## 8. Procedimento recomendado para o primeiro administrador

**Este procedimento é apenas uma recomendação; não foi executado.**

1. Um operador autorizado revisa no Dashboard as configurações hospedadas,
   primeiro confirmando que cadastro público e login anônimo estão desabilitados,
   que a confirmação de e-mail está adequada, que os redirects são restritos e
   que o envio de e-mail está operacional. Para contas administrativas, habilitar
   MFA quando disponível e compatível com o plano.
2. No Dashboard autenticado, criar ou convidar a pessoa administradora
   selecionada. Não abrir cadastro público e não criar uma rota de promoção.
3. Confirmar o endereço de e-mail pelo fluxo de convite/confirmação e obter o UUID
   real da conta pela interface administrativa do Supabase.
4. Após autorização explícita e revisão do UUID, um operador confiável pode
   associar a conta usando o SQL Editor autenticado do projeto ou outro ambiente
   administrativo restrito. A operação deve inserir somente o UUID autorizado:

   ```sql
   INSERT INTO public.admin_profiles (user_id)
   VALUES ('<UUID_REAL_DO_USUARIO_AUTH>'::uuid);
   ```

   Não executar a instrução com o placeholder nem disponibilizar acesso a esse
   mecanismo para usuários comuns. Não usar a chave secreta no Electron, renderer
   ou navegador.
5. Registrar operador, aprovação, data/hora e UUID em registro operacional
   controlado. Como não existe trilha persistente no schema atual, aprovar um
   mecanismo de auditoria antes de operações administrativas comerciais
   recorrentes.
6. Validar o login do administrador e, com uma conta de teste autorizada, negar
   explicitamente operações administrativas a uma conta sem perfil. Esses testes
   exigem aprovação separada e não foram executados nesta auditoria.

## 9. Checklist das próximas ações

- [ ] Operador autorizado revisar as configurações hospedadas no Dashboard, sem
      salvar alterações durante a auditoria.
- [ ] Confirmar URLs de produção e SMTP próprio antes de depender de e-mail
      transacional.
- [ ] Manter cadastro público e login anônimo desabilitados enquanto o fluxo
      comercial não estiver pronto.
- [ ] Decidir a pessoa administradora e obter autorização explícita antes de
      criar/invitar a conta.
- [ ] Provisionar o perfil somente após confirmação do e-mail e conferência do
      UUID por operador confiável.
- [ ] Definir trilha de auditoria e MFA para administradores antes da operação
      comercial.
- [x] Remover `EXECUTE` de `anon` em `public.is_admin()` por migration
      incremental autorizada e confirmar os privilégios efetivos no remoto.
- [ ] Planejar os fluxos de Auth/Edge Functions separadamente; não incluir
      pagamentos ou liberação de licenças nesta etapa.

## 10. Validação e preservação

- `supabase db query --remote --read-only`: executado; apenas contagens
  agregadas, sem PII.
- `supabase db push --remote --skip-vault --dry-run`: confirmou que somente a
  migration autorizada seria aplicada, sem seeds ou roles.
- `supabase db push --remote --skip-vault --yes`: aplicou somente
  `20261126025315_restrict_is_admin_anon_execution.sql`, com autorização
  explícita.
- `supabase migration list --remote`: confirmou as migrations inicial e
  incremental no histórico remoto.
- Consulta read-only após a aplicação confirmou
  `anon_can_execute = false`, `authenticated_can_execute = true`,
  `SECURITY DEFINER` e `search_path` vazio.
- Nova contagem read-only confirmou 0 usuários Auth, 0 perfis administrativos
  e 0 clientes.
- `npm run check`: executado com sucesso — lint, formatação e **74 testes
  aprovados**, nenhum falhou.
- Uma única migration incremental de ACL foi aplicada após autorização
  explícita. Nenhum dado, usuário, configuração de Auth, secret ou policy foi
  alterado.
- `git status` e estatísticas do diff foram inspecionados. As alterações locais
  preexistentes foram preservadas; os únicos arquivos adicionais desta etapa
  são a migration, seu teste e as atualizações de documentação/relatório.
- Nenhum commit ou push foi realizado.
