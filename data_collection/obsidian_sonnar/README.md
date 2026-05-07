# 🔎 Sonnar — Engine de Coleta (data_collection)

Bem-vindo ao manual da **engine de coleta de vagas** do Sonnar. Se você nunca mexeu nesse código, comece por aqui.

## O que essa engine faz

Em uma frase: **vai a sites de emprego, lê as vagas, organiza os dados e salva tudo num lugar só, repetidamente, sem cair, sem ser bloqueado e sem perder informação.**

Ela é o motor que alimenta o resto do produto — sem essa engine rodando, a landing-page e o app não têm vagas para mostrar, e o sistema de mensagens não tem o que enviar.

## Como funciona em 30 segundos

```
                 ┌──────────────────────────────────┐
                 │          scrapy.py (loop)        │
                 │  ┌────────────────────────────┐  │
                 │  │  17 engines (LinkedIn,     │  │
                 │  │  Indeed, Gupy, etc.)       │  │
                 │  └────────────┬───────────────┘  │
                 │               │ achou vaga       │
                 │               ▼                  │
                 │  ┌────────────────────────────┐  │
                 │  │  Pipeline:                 │  │
                 │  │   normalizar               │  │
                 │  │   tracker.mark_running     │  │
                 │  │   salvar nos 3 sinks       │  │
                 │  │   tracker.mark_completed   │  │
                 │  └────────────────────────────┘  │
                 └──────────────────────────────────┘
                       │           │           │
                       ▼           ▼           ▼
                  jobs.json    job.csv    Supabase
                 (uso local) (analytics) (produção)
```

A cada **2 horas** (configurável) ele dispara um novo lote de coleta. Entre os lotes, dorme.

## Onde olhar primeiro

| Quero entender… | Leia |
|---|---|
| A arquitetura geral, como tudo se conecta | [[ARCHITECTURE]] |
| Como cada engine (site) funciona | [[ENGINES]] |
| Como a engine se protege de bloqueios | [[RATE_LIMIT_AND_RESILIENCE]] |
| Como acompanhar a engine em produção | [[OBSERVABILITY]] |
| Como recuperar dados quando algo dá errado | [[CHECKPOINT_AND_DLQ]] |
| Como instalar, rodar, mexer no dia a dia | [[OPERATIONS]] |
| Glossário de termos técnicos | [[GLOSSARY]] |

## Filosofia do projeto

> A melhor coleta não é a mais rápida. É a que extrai o **máximo possível** com **estabilidade**, **rastreabilidade**, **baixa chance de bloqueio** e **sem perder dados**.

Isso significa que, se em algum momento for preciso escolher entre "extrair 1000 vagas/min e correr risco de ban" ou "extrair 200 vagas/min e nunca ser bloqueado", **a segunda opção sempre vence**.

## Dúvidas frequentes

**"Por que tantos sites diferentes?"**
Cada site cobre um nicho. LinkedIn é forte em corporativo, Gupy em médias empresas BR, Remotive em remoto internacional. Quanto mais fontes, mais completo é o catálogo de vagas que o Sonnar oferece ao usuário final.

**"Por que rodar a cada 2h e não em tempo real?"**
Bom-senso anti-bloqueio. Se você bate em LinkedIn 24×7, ele bane. Coletar 12× ao dia já cobre bem vagas novas, com margem segura.

**"O que acontece se a engine cair?"**
Ela sobe sozinha, vê o que já tinha sido feito (no Supabase) e continua de onde parou. Nenhuma vaga já salva é processada de novo, e nenhuma URL pendente fica esquecida. Detalhes em [[CHECKPOINT_AND_DLQ]].

**"Como sei se está funcionando?"**
Olhe o painel `/admin/scraper` no dashboard. Se os números estão crescendo e a coluna "Circuits abertos" está em zero, está tudo bem. Veja [[OBSERVABILITY]].
