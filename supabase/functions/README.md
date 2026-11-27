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
- `license-validate` (POST): valida a licença ou o teste do cliente e registra o
  dispositivo. A migration aplica o limite de cada plano de forma atômica e
  impede que um computador reinicie o teste com outra conta. A resposta inclui o
  plano, dispositivos, horário do servidor e, quando permitido, uma
  janela de validação offline de até 72 horas. A janela não ultrapassa a
  expiração da licença ou do teste; ela é mantida apenas enquanto o processo
  desktop estiver em execução. Clientes antigos recebem no máximo 24 horas.
- `device-remove` (POST): revoga o dispositivo informado apenas nas licenças
  pertencentes ao usuário autenticado.

A migration `20261127000000_device_licensing.sql` foi aplicada ao projeto
remoto antes do deploy das funções. Ela preserva planos e dispositivos já
existentes; em bancos que ainda não possuem plano, classifica licenças antigas
como Multi (dois computadores). O backend comercial deve informar `plan_code` e
`max_devices` explicitamente ao criar novas licenças. A escrita direta das
tabelas de dispositivos e trials fica reservada ao backend. Trials antigos
são vinculados aos computadores que os utilizarem, sem reiniciar seus prazos.
Não é possível recuperar o histórico de computadores anterior à migration.

O identificador do dispositivo é um hash do identificador do sistema operacional.
Quando este não está disponível, usa-se o endereço MAC ou o nome do computador
como alternativa; alterações nesses dados podem gerar outro identificador.
Identificadores enviados pelo cliente não impedem falsificação.

Pagamentos, administração e liberação de licenças continuam fora deste
incremento. As funções devem ser testadas localmente antes de novas publicações.
