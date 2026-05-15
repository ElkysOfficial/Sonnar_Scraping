# Sonar Database - Supabase Integration

Este módulo centraliza toda a integração com Supabase para o projeto Sonar.

## Estrutura

```
database/
├── migrations/           # SQL migrations
│   ├── 001_initial_schema.sql    # Tabelas principais
│   ├── 002_data_retention.sql    # Políticas de retenção
│   ├── 003_enable_rls.sql        # Segurança (RLS)
│   └── 004_vip_pending_fields.sql # VIP pendente (workflow)
├── lib/
│   ├── supabase.js       # Client Node.js
│   └── supabase_client.py # Client Python
├── migrations/scripts/
│   └── migrate-json-to-db.js     # Migração de dados JSON
├── package.json
├── .env.example
└── README.md
```

## Configuração

### 1. Criar projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie uma conta
2. Crie um novo projeto
3. Copie a URL e a Service Role Key das configurações da API

### 2. Configurar variáveis de ambiente

Copie `.env.example` para `.env` em cada serviço:

```bash
# database/.env
# message_formatting/core/.env
# message_sending/whatsapp/.env
# data_collection/.env

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 3. Executar migrations

No dashboard do Supabase:
1. Vá para "SQL Editor"
2. Execute o conteúdo de `migrations/001_initial_schema.sql`
3. Execute o conteúdo de `migrations/002_data_retention.sql`
4. Execute o conteúdo de `migrations/003_enable_rls.sql` (ativa RLS)
5. Execute o conteúdo de `migrations/004_vip_pending_fields.sql` (campos extras de VIP pendente)

### 4. Migrar dados existentes

```bash
cd database
npm install
node migrations/scripts/migrate-json-to-db.js
```

## Tabelas

| Tabela | Descrição | Substitui |
|--------|-----------|-----------|
| `jobs` | Vagas de emprego | job_data.json |
| `vip_subscribers` | Assinantes VIP | vip-subscribers.json |
| `vip_pending_subscribers` | Assinantes pendentes | vip-pending-subscribers.json |
| `vip_delivery_history` | Histórico de envio VIP | vip-history.json |
| `group_delivery_history` | Histórico de envio grupos | sent_history.json |
| `auto_responders` | Respostas automáticas | auto-responder.json |
| `group_features` | Recursos por grupo | anti-link-groups.json, etc |
| `sender_state` | Estado dos senders | *-sender-state.json |
| `user_mutes` | Usuários silenciados | muted.json |
| `enrichment_cache` | Cache de enriquecimento | google_cache.json |
| `scraper_stats` | Estatísticas de scraping | (novo) |
| `retention_policies` | Políticas de retenção | (novo) |
| `cleanup_log` | Log de limpeza | (novo) |

## Políticas de Retenção

Os dados são automaticamente limpos de acordo com as políticas configuradas:

| Tipo | Retenção Padrão | Condição |
|------|-----------------|----------|
| Jobs | 90 dias | Após envio para todos os canais |
| Histórico de entrega | 60 dias | Idade do registro |
| Cache de enriquecimento | 30 dias | Expiração automática |
| Estatísticas de scraper | 30 dias | Idade do registro |
| Assinantes pendentes | 30 dias | Sem aprovação |

Para alterar as políticas:

```sql
UPDATE retention_policies
SET retention_days = 120
WHERE policy_name = 'jobs';
```

### Executar limpeza manualmente

```sql
SELECT * FROM run_cleanup_with_policies();
```

### Agendar limpeza automática (pg_cron)

1. Habilite a extensão pg_cron no dashboard do Supabase
2. Descomente as linhas de cron job em `002_data_retention.sql`
3. Execute novamente a migration

## Uso

### Node.js (core, whatsapp)

```javascript
import {
  upsertJob,
  getPendingJobs,
  updateJobStatus,
  getActiveVipSubscribers
} from '../database/lib/supabase.js'

// Inserir vaga
const job = await upsertJob({
  job_title: 'Desenvolvedor',
  job_url: 'https://example.com/job/123',
  company: 'Tech Company',
  location: 'São Paulo',
  source: 'indeed'
})

// Buscar vagas pendentes
const pending = await getPendingJobs('whatsapp')

// Marcar como enviada
await updateJobStatus(job.id, 'whatsapp', true)
```

### Python (data_collection)

```python
from database.lib.supabase_client import (
    upsert_job,
    get_existing_job_urls,
    record_scraper_stats
)

# Verificar URLs existentes
existing = get_existing_job_urls()

# Inserir vaga
job = upsert_job({
    'job_title': 'Desenvolvedor',
    'job_url': 'https://example.com/job/123',
    'company': 'Tech Company',
    'source': 'indeed'
})

# Registrar estatísticas
record_scraper_stats('indeed', jobs_found=50, jobs_new=10)
```

## Arquitetura

```
┌─────────────────────┐
│   data_collection   │  (Python)
│   - Scrapers        │
│   - Enrichment      │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│     Supabase        │
│   - PostgreSQL      │
│   - Indexes         │
│   - Auto-cleanup    │
└─────────┬───────────┘
          │
    ┌─────┴─────┐
    ▼           ▼
┌───────────┐ ┌───────────┐
│   core    │ │ whatsapp  │  (Node.js)
│  (API)    │ │   (Bot)   │
└───────────┘ └───────────┘
```

## Índices

O schema inclui índices otimizados para queries comuns:

- `idx_jobs_pending_*`: Jobs pendentes por canal
- `idx_jobs_created_at`: Ordenação por data
- `idx_vip_delivery_subscriber`: Histórico VIP por assinante
- `idx_group_features_*`: Features por grupo

## Monitoramento

### Ver estatísticas dos scrapers

```sql
SELECT * FROM get_scraper_stats_summary(24); -- últimas 24 horas
```

### Ver histórico de limpeza

```sql
SELECT * FROM cleanup_log ORDER BY executed_at DESC LIMIT 10;
```

### Ver políticas de retenção

```sql
SELECT * FROM retention_policies;
```

## Troubleshooting

### Erro: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"

Verifique se o arquivo `.env` existe e contém as variáveis corretas.

### Erro: "relation 'jobs' does not exist"

Execute as migrations no SQL Editor do Supabase.

### Limpeza não está funcionando

1. Verifique se pg_cron está habilitado
2. Execute manualmente: `SELECT run_cleanup_with_logging()`
3. Verifique os logs: `SELECT * FROM cleanup_log`
