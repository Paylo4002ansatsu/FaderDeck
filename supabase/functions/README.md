# Edge Functions

As funções comerciais iniciais usam a identidade confirmada por
`auth.getUser()` e nunca aceitam identificadores de cliente enviados pelo
chamador. O cliente privilegiado é criado somente após a autenticação; configure
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (ou `SUPABASE_ANON_KEY`) e
`SUPABASE_SECRET_KEY` (ou `SUPABASE_SERVICE_ROLE_KEY`) no ambiente das funções.
A chave privilegiada deve permanecer exclusivamente no servidor.

- `trial-start` (POST): recebe `device_hash` e opcionalmente `device_label` e
  usa a mesma validação de licenciamento para iniciar ou consultar o trial.
  Um computador já registrado mantém seu prazo original, inclusive em outra
  conta. Clientes antigos que não enviam o identificador recebem uma resposta
  de ativação pendente; o trial é criado apenas na validação do computador.
- `trial-status`: devolve o trial do cliente autenticado e marca como expirado
  quando o relógio do servidor alcança `ends_at`.
- `license-validate` (POST): valida a licença ou o teste do cliente e registra o
  dispositivo. A migration aplica o limite de cada plano de forma atômica e
  impede que um computador reinicie o teste com outra conta. A resposta inclui o
  plano, dispositivos, horário do servidor e, quando permitido, uma
  janela de validação offline de até 72 horas. A janela não ultrapassa a
  expiração da licença ou do teste. O desktop guarda a sessão e a última
  validação no armazenamento protegido do sistema, quando disponível, para
  permitir uso offline após reiniciar quando a opção de manter a sessão está
  marcada. O bridge independente não oferece persistência offline após
  reiniciar. Clientes antigos recebem no máximo 24 horas.
- `device-remove` (POST): revoga o dispositivo informado apenas nas licenças
  pertencentes ao usuário autenticado. Um dispositivo removido só volta a ser
  ativado mediante solicitação explícita, respeitando o limite do plano.

O desktop revalida o acesso a cada 30 segundos quando possível. Ao reconectar,
uma revogação pode levar até a próxima revalidação para ser aplicada. A proteção
offline depende do relógio local após reiniciar; ela rejeita um relógio anterior
à última validação, mas não impede toda manipulação de relógio ou do cliente.
Se o armazenamento seguro não estiver disponível, a sessão e a janela offline
ficam apenas em memória.

A migration `20261127000000_device_licensing.sql` foi aplicada ao projeto
remoto antes do deploy das funções. Ela preserva planos e dispositivos já
existentes; em bancos que ainda não possuem plano, classifica licenças antigas
como Multi (dois computadores). O backend comercial deve informar `plan_code` e
`max_devices` explicitamente ao criar novas licenças. A escrita direta das
tabelas de dispositivos e trials fica reservada ao backend. Trials antigos
são vinculados aos computadores que os utilizarem, sem reiniciar seus prazos.
Não é possível recuperar o histórico de computadores anterior à migration.
Antes de publicar as funções atualizadas, aplique e teste a migration local
`20261128000000_explicit_device_reactivation.sql` no ambiente apropriado.

O identificador do dispositivo é um hash do identificador do sistema operacional.
Quando este não está disponível, usa-se o endereço MAC ou o nome do computador
como alternativa; alterações nesses dados podem gerar outro identificador.
Identificadores enviados pelo cliente não impedem falsificação.

Pagamentos, administração e liberação de licenças continuam fora deste
incremento. As funções devem ser testadas localmente antes de novas publicações.
