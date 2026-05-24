# Extração de "Responsabilidades" da Description (v3.0.0)

> Documento de design baseado na análise de ~50 vagas por engine no Supabase.
> Guia para a família de PRs `feat(scraper): extracao-responsabilidades-*`.

## Problema

Hoje a `description` completa vai pro card do WhatsApp. Muitas descrições
têm:

- Sobre a empresa ("Somos a maior cooperativa de saúde...")
- Lista de benefícios
- Requisitos / qualificações
- Logística (local, horário, salário)

O assinante quer ver **o que ele vai fazer no trabalho** — responsabilidades,
atividades, tarefas. O resto polui o card.

## Solução

Adicionar campo novo `responsibilities` (texto extraído) preservando
`description` (texto bruto). O card do WhatsApp passa a usar
`responsibilities` quando disponível, com fallback pra `description`
completa quando a extração falha.

## Schema novo

### Tabela `jobs` (Supabase)

```sql
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS responsibilities TEXT,
  ADD COLUMN IF NOT EXISTS description_lang TEXT;  -- 'pt', 'en', etc.
```

### `jobs.json` (single-writer = core)

```jsonc
{
  "https://...": {
    // campos existentes...
    "description": "Texto completo do site (em qualquer idioma)",
    "responsibilities": "Texto extraído + traduzido pra PT",
    "description_lang": "en"
  }
}
```

## Achados da análise (50+ vagas / engine)

Volume e qualidade por engine, ordenado por total:

| Engine | Total | Desc Completa | Tam. Médio | Comentário |
|---|---|---|---|---|
| careerjet | 30.353 | 30% | 279 chars | API entrega excerto — fonte limitada |
| linkedin | 18.906 | **99%** | 2.844 | Rica em seções estruturadas |
| dice | 9.509 | **99%** | 3.929 | EN, rica |
| jooble | 6.020 | 99% | 2.378 | PT |
| infojobs | 2.540 | 100% | 1.539 | PT, padrões claros |
| catho | 1.834 | 99% | 1.911 | PT |
| indeed | 1.630 | 37% | 1.135 | **Cloudflare bloqueia detail** |
| bne | 988 | 83% | 660 | PT |
| geekhunter | 952 | 98% | 1.785 | PT |
| programathor | 61 | 100% | 2.242 | PT |
| gupy | 48 | 100% | 2.246 | PT |
| michaelpage | 35 | 100% | 2.134 | PT |

## Heurística de extração

### Marcadores que SINALIZAM "o que a pessoa faz"

| Idioma | Cabeçalhos |
|---|---|
| **PT** | `Responsabilidades e atribuições`, `Responsabilidades`, `Principais atividades`, `Atividades`, `Atribuições`, `Sobre a Vaga`, `O que você vai fazer`, `Suas atividades`, `Descrição da vaga`, `O que você vai encontrar`, `Atuação` |
| **EN** | `Responsibilities`, `Key Responsibilities`, `Main Responsibilities`, `What You'll Do`, `What you will do`, `Job Description`, `Duties`, `Your Role`, `In this role`, `Position responsibilities`, `The Role` |

### Marcadores a IGNORAR (não vão pro card)

| Categoria | PT | EN |
|---|---|---|
| Sobre empresa | `Sobre nós`, `Somos`, `Nossa missão`, `Quem somos`, `A empresa` | `About us`, `Who we are`, `Our mission`, `Overview`, `Our story` |
| Requisitos | `Requisitos`, `Qualificações`, `Você irá se destacar`, `Competências`, `Conhecimentos necessários` | `Requirements`, `Must Have`, `Qualifications`, `Required Skills`, `Skills Matrix` |
| Diferenciais | `Diferenciais`, `Será um diferencial` | `Nice to have`, `Bonus points`, `Preferred` |
| Benefícios | `Benefícios`, `O que oferecemos`, `Pacote de benefícios` | `Benefits`, `What we offer`, `Perks`, `Compensation` |
| Educação | `Escolaridade`, `Formação acadêmica` | `Education`, `Degree`, `Academic background` |
| Logística | `Local de trabalho`, `Horário`, `Modelo de trabalho`, `Remuneração`, `Faixa salarial` | `Location`, `Salary`, `Schedule`, `Work model` |

### Algoritmo (pseudo-código)

```python
def extract_responsibilities(description: str, lang: str) -> str | None:
    """Retorna o trecho da description que corresponde a responsabilidades.

    Estratégia em 3 camadas (cai pra próxima quando a anterior falha):

    1. **Seção marcada**: procura cabeçalho em INCLUDE_MARKERS e pega texto
       até o próximo cabeçalho conhecido (de qualquer categoria) ou fim.

    2. **Bullets sem cabeçalho**: se a description é dominada por <li>/<ul>
       (ou linhas com '- ', '• ', etc.), considera tudo como atividades.

    3. **Fallback**: devolve None — o card usará description completa.
    """
    sections = split_by_known_headings(description, lang)
    for sec in sections:
        if matches_any(sec.heading, INCLUDE_MARKERS[lang]):
            return clean_html(sec.body)

    if is_mostly_bullets(description):
        return clean_html(description)

    return None  # fallback pra description completa
```

## Tradução

### Engines com vagas em outros idiomas

| Engine | Idioma típico | Estratégia |
|---|---|---|
| **Careerjet** | Multi (140 locales) | **Já traduz** via Argos (`src/utils/translator.py`) — modelo a seguir |
| **Dice** | EN (mercado US) | Sempre traduzir |
| **LinkedIn** | PT + estrangeiras | Detectar idioma; traduzir não-PT |
| **Indeed BR** | PT (raras EN) | Detectar idioma; traduzir não-PT |
| **RemoteOK** | EN | Sempre traduzir |
| **Remotive** | EN | Sempre traduzir |
| **WeWorkRemotely** | EN | Sempre traduzir |
| **ZipRecruiter UK** | EN | Sempre traduzir |
| Demais (BNE, Catho, GeekHunter, Gupy, InfoJobs, Jooble, MichaelPage, ProgramaThor, SimplyHired) | PT | Sem tradução |

### Pipeline de tradução

1. **Detecção de idioma** — heurística rápida (já existe em
   `careerjet._looks_portuguese` e `_source_lang`). Generalizar pra módulo
   compartilhado `src/utils/lang_detect.py`.
2. **Tradução** — `translator.translate_to_pt(text, src_lang)` já existe
   (Argos Translate, offline). Frontload dos modelos no startup.
3. **Aplicação** — só nas engines da tabela acima. Engines PT-only não
   passam pela tradução (custo zero).

## Roadmap de sub-PRs (rumo a v3.0.0)

> **Nota de versionamento:** as versões v2.15.0–v2.17.x foram usadas para
> a entrega de billing/mudança de plano (PRs #61 a #67). O roadmap do épico
> retomou em v2.18.0 logo abaixo. Os números seguem só pra ordenar.

| Sub-PR | Versão | Entrega | Status |
|---|---|---|---|
| 4.0 | v2.14.0 | Este documento + schema (migration `responsibilities` + `description_lang`) | ✅ |
| 4.1 | **v2.18.0** | Módulo `src/utils/section_extractor.py` (regex de cabeçalhos PT/EN + algoritmo) + testes unitários | ✅ |
| 4.2 | **v2.19.0** | Módulo `src/utils/lang_detect.py` + scripts `validate_engine`/`validate_engines` | ✅ |
| 4.3 | **v2.20.0** | **LinkedIn** + helper central `job_enrichment` + tupla canônica 10→12 campos | ✅ |
| 4.4 | **v2.21.0** | **Dice** (EN sempre, hint_lang='en') + script `backfill_enrichment.py` | ✅ |
| 4.5 | v2.22.0 | **Engines remotas EN** (RemoteOK, Remotive, WeWorkRemotely, ZipRecruiter) | ⏳ |
| 4.6 | v2.23.0 | **Engines PT** (Indeed, Catho, InfoJobs, BNE, GeekHunter, Jooble, MichaelPage, ProgramaThor, SimplyHired, Gupy) — só extração | ⏳ |
| 4.7 | v2.24.0 | **Careerjet** — reusar pipeline central (manter compatibilidade com tradução já existente) | ⏳ |
| 4.8 | v2.25.0 | **Formatter** atualizado pra usar `responsibilities` (com fallback pra `description`) | ⏳ |
| 4.9 | **v3.0.0** | **Marco oficial** — release consolidado com changelog e doc no `OPERACAO.md` | ⏳ |

## Métricas de sucesso

Após v3.0.0:

1. Cards do WhatsApp passam de descrição misturada (sobre + reqs + benefícios)
   para apenas "o que a pessoa faz".
2. Vagas estrangeiras 100% legíveis em PT-BR.
3. Métrica medível: % de vagas com `responsibilities` não-nulo. Meta: >80%
   (as outras 20% caem no fallback de description completa).

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Heurística de cabeçalhos falha em vagas com formato inesperado | Fallback pra description completa (não pior que hoje) |
| Tradução Argos lenta/imprecisa em descrições longas | Já usado pelo Careerjet em produção; aceitamos qualidade atual |
| Aumento do tamanho do `jobs.json` (campo a mais) | Compensado por **redução** do que o card mostra; tamanho do JSON quase igual (só o campo adicional) |
| Re-extração de vagas antigas | Bump de `PARSER_VERSION` por engine — auto-reenrichment do tracker pega |
