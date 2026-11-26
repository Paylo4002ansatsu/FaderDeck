# Edge Functions

As funções comerciais iniciais usam a identidade confirmada por
`auth.getUser()` e nunca aceitam identificadores de cliente enviados pelo
chamador. O cliente privilegiado é criado somente após a autenticação; configure
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (ou `SUPABASE_ANON_KEY`) e
`SUPABASE_SECRET_KEY` (ou `SUPABASE_SERVICE_ROLE_KEY`) no ambiente das funções.
A chave privilegiada deve permanecer exclusivamente no servidor.

- `trial-start` (POST): cria um único trial de sete dias por cliente e devolve
  o trial existente sem reiniciar suas datas.
- `trial-status`: devolve o trial do cliente autenticado e marca como expirado
  quando o relógio do servidor alcança `ends_at`.
- `license-validate` (POST): valida uma licença ou trial para o cliente e
  registra o dispositivo, limitando a dois dispositivos não revogados por
  licença. A resposta inclui o horário do servidor e, quando permitido, uma
  janela de validação offline de 24 horas.

Pagamentos, administração e liberação de licenças continuam fora deste
incremento. As funções devem ser testadas localmente antes de qualquer
publicação; nenhuma função é implantada remotamente por esta etapa.
