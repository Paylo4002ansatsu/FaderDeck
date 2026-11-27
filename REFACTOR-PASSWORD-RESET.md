# Refatoração do Fluxo de Recuperação de Senha — FaderDeck Desktop

## Resumo da Implementação

O fluxo de recuperação de senha foi refatorado para funcionar **100% dentro do aplicativo desktop**, via código OTP de 6 a 8 dígitos enviado por e-mail, sem redirecionar para navegador externo.

## 1. Backend (Bridge)

### Arquivo: `bridge/supabase-client.cjs`

Adicionadas 2 novas funções:

#### `verifyOtp({ email, token, type })`
- Valida o código OTP de 6 a 8 dígitos usando a API Supabase `auth.verifyOtp()`
- Tipo: `recovery` (específico para recuperação de senha)
- Mantém a sessão de recuperação em um cliente Supabase separado, em memória, sem autenticar a sessão principal do app.

#### `updateUser({ password })`
- Atualiza a senha do usuário utilizando a sessão verificada
- Usa `auth.updateUser()` do cliente de recuperação, após verificar o código.

#### Modificação: `resetPasswordForEmail(email)`
- Removido o parâmetro `redirectTo` (antes apontava para página web)
- Agora envia apenas o código OTP por e-mail para entrada manual no desktop

### Arquivo: `bridge/http-router.cjs`

Adicionadas 3 rotas POST (`/api/account/`):

#### **Etapa 1: `POST /api/account/reset-password`**
- Recebe: `{ email }`
- Valida formato do e-mail
- Chama `supabaseClient.resetPasswordForEmail(email)`
- Retorna: `{ sent: true, message: "..." }`
- Erro: `400` (e-mail ausente), `429` (rate limit), ou outro status de falha do Supabase

#### **Etapa 2: `POST /api/account/reset-password/verify`**
- Recebe: `{ email, code }` (code = 6 a 8 dígitos numéricos)
- Valida formato do código com regex `^\d{6,8}$`
- Chama `supabaseClient.verifyOtp({ email, token: code, type: 'recovery' })`
- Mantém sessão de recuperação ativa no cliente Supabase em memória
- Retorna: `{ verified: true, message: "..." }`
- Erro: `400` (formato inválido), `401` (código expirado/inválido), `429` (rate limit) ou `502` (falha do serviço)

#### **Etapa 3: `POST /api/account/reset-password/confirm`**
- Recebe: `{ password }`
- Valida mínimo de 8 caracteres
- Chama `supabaseClient.updateUser({ password })` usando sessão de recuperação verificada
- Encerra a sessão de recuperação com `supabaseClient.signOutRecovery()`
- Retorna: `{ updated: true, message: "Senha alterada com sucesso!..." }`
- Erro: `400` (senha < 8 chars), `429` (rate limit), `502` (falha geral)

## 2. Interface (Frontend)

### Janela principal: `client/index.html`, `main.js` e `assets/qr-overlay.js`

O Electron carrega `client/index.html` e injeta `assets/qr-overlay.js` a partir de `main.js`. A tela de acesso da janela principal é criada pelo overlay, não por `client/admin/index.html`. Ambos oferecem as três etapas.

### Arquivo: `client/admin/index.html`

Adicionados elementos HTML para 3 passos:

#### **Passo 1 — Solicitar Código**
- Campo `E-MAIL` (reutiliza `#account-login-email`)
- Botão `Enviar código de recuperação`
- Link `Voltar para o login`

#### **Passo 2 — Validar Código**
- Display do e-mail: "Código enviado para: xxx@example.com"
- Campo `CÓDIGO DE VERIFICAÇÃO` (6 a 8 dígitos, `inputMode="numeric"`, `maxLength={8}`)
- Botão `Validar código`
- Opções: `Reenviar código` e `Alterar e-mail`

#### **Passo 3 — Definir Nova Senha**
- 2 campos: `NOVA SENHA` e `CONFIRMAR NOVA SENHA`
- Ambos com botão `Mostrar`/`Ocultar`
- Validação integrada: senhas coincidem + mínimo 8 caracteres
- Botão `Salvar nova senha`

### Arquivo: `client/admin/bridge.js`

#### Estado da Recuperação
```javascript
let resetFlowState = {
  step: null,      // 1, 2, ou 3
  email: null,     // e-mail fornecido
  code: null       // código verificado (não utilizado, apenas referência)
};
```

#### Função `setAccountMode(mode, options)`
- Dinâmico: exibe/oculta campos baseado em `resetFlowState.step`
- Atualiza título, descrição e texto do botão conforme etapa

#### Fluxo de Envio (`form#account-login`)
1. **Etapa 1**: Envia `POST /api/account/reset-password`
   - Avança para passo 2
   - Foca no campo de código

2. **Etapa 2**: Valida código com regex e envia `POST /api/account/reset-password/verify`
   - Avança para passo 3
   - Foca no campo de nova senha

3. **Etapa 3**: Valida senhas (coincidência + 8 chars) e envia `POST /api/account/reset-password/confirm`
   - Retorna ao login
   - Exibe banner verde: "Senha alterada com sucesso! Entre com sua nova senha."

#### Botões de Navegação
- **Passo 2**: `Reenviar código`, `Alterar e-mail`, `Voltar`
- **Passo 3**: `Voltar` (retorna ao passo 2)
- **Sempre**: `Voltar para o login` (sai do fluxo)

## 3. Testes

### Arquivo: `tests/http-router.test.cjs`

Adicionados 4 novos testes:

1. **`verify OTP endpoint validates recovery code`**
   - Testa sucesso com código válido
   - Testa falha com código inválido (401 + mensagem específica)

2. **`verify OTP rejects codes outside the 6-to-8-digit numeric range`**
   - Valida rejeição de formatos inválidos (400)

3. **`password confirm endpoint updates password and signs out`**
   - Verifica ordem: `updateUser()` → `signOutRecovery()`
   - Valida resposta de sucesso

4. **`password confirm rejects passwords shorter than 8 characters`**
   - Valida rejeição (400)

### Arquivo: `tests/account-feedback-ui.test.cjs`

Atualizado teste para refletir nova estrutura de recuperação com múltiplos passos.

### Arquivo: `tests/supabase-client-env.test.cjs`

Atualizado teste para validar que `resetPasswordForEmail()` não passa `redirectTo`.

## 4. Validação

### Executar Testes
```bash
npm run check
```
Para validar também a interação das duas telas no navegador:
```bash
npm run test:e2e -- tests/e2e/password-recovery.spec.js
```

## 5. Fluxo Visual (UX)

```
┌─────────────────────────────────────────┐
│  Recuperar acesso                       │
├─────────────────────────────────────────┤
│                                         │
│  Etapa 1: E-mail                        │
│  ┌─────────────────────────────────┐   │
│  │ [E-mail]                        │   │
│  └─────────────────────────────────┘   │
│  [Enviar código de recuperação]         │
│  Voltar para o login                    │
│                                         │
└─────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────┐
│  Recuperar acesso                       │
├─────────────────────────────────────────┤
│                                         │
│  Código enviado para: user@example.com  │
│  Etapa 2: Código                        │
│  ┌─────────────────────────────────┐   │
│  │ [______]                        │   │
│  └─────────────────────────────────┘   │
│  [Validar código]                       │
│  Reenviar código · Alterar e-mail       │
│                                         │
└─────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────┐
│  Recuperar acesso                       │
├─────────────────────────────────────────┤
│                                         │
│  Etapa 3: Nova Senha                    │
│  ┌─────────────────────────────────┐   │
│  │ [____________] [Mostrar]        │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │ [____________] [Mostrar]        │   │
│  └─────────────────────────────────┘   │
│  [Salvar nova senha]                    │
│  Voltar                                 │
│                                         │
└─────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────┐
│  🟢 Senha alterada com sucesso!         │
│      Entre com sua nova senha.          │
│                                         │
│  Bem-vindo de volta                     │
│  ┌─────────────────────────────────┐   │
│  │ [E-mail]                        │   │
│  │ [Senha]                         │   │
│  └─────────────────────────────────┘   │
│  [Entrar no FaderDeck]                  │
│                                         │
└─────────────────────────────────────────┘
```

## Notas Importantes

- ✅ **100% desktop**: Sem redirecionamento para web
- ✅ **OTP por e-mail**: Código de 6 a 8 dígitos numéricos
- ⚠️ O template de recuperação do Supabase implantado precisa incluir `{{ .Token }}` para exibir o código; enviar um link apenas não permite concluir esse fluxo no app.
- ✅ **Sem dependências novas**: Usa apenas Supabase Auth nativo
- ✅ **Sessão temporária**: Validação de OTP ativa apenas para confirmação de senha
- ✅ **UX clara**: 3 passos bem definidos com feedback visual
- ✅ **Tratamento de erros**: Mensagens específicas (expirado, inválido, rate limit)
- ✅ **Validação forte**: Formato de e-mail, regex de código, mínimo de senha
- ✅ **Testes completos**: 4 novos testes unitários + atualização dos existentes

## Próximas Melhorias (Futuro)

- [ ] Adicionar countdown para reenvio de código
- [ ] Implementar TOTP alternativo
- [ ] Suportar biometria para dispositivos compatíveis
- [ ] Histórico de tentativas falhadas
