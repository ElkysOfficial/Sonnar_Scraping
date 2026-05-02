---
title: "Subscriber row ausente em janela pós-signup (investigado)"
tags: [issue, auth, database]
severity: medium
status: not-an-issue
last-update: 2026-05-01
---

# Subscriber row ausente em janela pós-signup

## Contexto

Auditoria inicial classificou como 🟠 MEDIUM o risco de um usuário recém-cadastrado acessar uma rota protegida **antes** do trigger `handle_new_user` criar a linha em `subscribers`, gerando `roleStatus = 'no-role'` e o toast de "auth-no-access".

## Descoberta

Investigação na migration `supabase/migrations/20260429000000_init_schema.sql:117-166`:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
...
BEGIN
  -- subscribers — passo 1 do cadastro
  INSERT INTO public.subscribers (...) VALUES (...);
  -- subscriber_profiles — passo 2 (Pro/Plus)
  IF v_profile IS NOT NULL AND v_plan <> 'free' THEN ... END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

**Conclusão:** o trigger é `AFTER INSERT ... FOR EACH ROW`, ou seja, roda **dentro da mesma transação** do `INSERT INTO auth.users`. Postgres só commita o usuário quando o trigger termina. Se o trigger falhar, a inserção do `auth.users` é revertida — não há janela de inconsistência.

Quando `supabase.auth.signUp()` retorna sucesso pro client:

1. `auth.users` foi criada **e** committada.
2. `subscribers` (e `subscriber_profiles` se Pro/Plus) já estão lá.
3. Só então o `onAuthStateChange` dispara `SIGNED_IN`.
4. `fetchUserRole` query encontra o subscriber.

**Não existe race condition**.

## Fluxos cobertos

| Fluxo                                               | Estado do subscriber |
| --------------------------------------------------- | -------------------- |
| Signup com email confirmation desligado             | ✅ existe na hora do `SIGNED_IN` |
| Signup com email confirmation ligado (link no email) | ✅ existe (criado no `signUp`, não no clique do link) |
| OAuth signup (não implementado, mas se vier)        | ✅ trigger é o mesmo |

## O que pode dar errado (e não é race)

- **Trigger lança exceção** (ex.: `(v_profile ->> 'seniority')::seniority_level` com valor inválido) → toda a transação rollback. `signUp()` retorna erro pro client. Não há sessão inválida.
- **Migration drop e recreate de `subscribers`** sem o trigger → gera o problema, mas é incidente operacional, não janela transacional.

## Plano

Issue **fechada como `not-an-issue`**. Mantida no vault pra documentar a investigação e evitar reabertura.

## Relações

- [[../../04-flows/auth-flow]]
- [[../../05-database/index]]

## Referências

- `supabase/migrations/20260429000000_init_schema.sql:117-166`
- `src/composables/useAuth.ts:fetchUserRole`
