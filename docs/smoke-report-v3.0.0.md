# Smoke Report v3.0.0 — pre-deploy

> Resultados dos `validate_engine` rodados contra o banco de produção
> (15 vagas mais recentes por engine). Mostra a taxa de extração que o
> formatter do bot vai conseguir aplicar **com a heurística atual**.

## Cobertura

| Engine | Vagas | by_lang | extracted % | Avaliação |
|---|---|---|---|---|
| **linkedin** | 15 | en:15 | **93%** | ✅ Excelente |
| **dice** | 15 | en:15 | **100%** | ✅ Excelente |
| **catho** | 15 | pt:13, en:2 | **80%** | ✅ Bom |
| **gupy** | 15 | pt:15 | **93%** | ✅ Excelente |
| michaelpage | 15 | pt:15 | 53% | 🟡 Médio |
| infojobs | 15 | pt:15 | 40% | 🟡 Médio |
| geekhunter | 15 | pt:15 | 40% | 🟡 Médio |
| programathor | 15 | pt:11, en:4 | 40% | 🟡 Médio |
| bne | 15 | pt:15 | 27% | 🟡 Baixo |
| jooble | 15 | en:10, pt:5 | 20% | 🟡 Baixo |
| indeed | 15 | pt:15 | 13% | 🔴 Crítico |
| **careerjet** | 15 | pt:15 | **0%** | 🔴 Crítico (description fragmentada, ~140 chars) |
| **simplyhired** | 0 | — | — | ⚠️ Sem dados |
| **remoteok** | 0 | — | — | ⚠️ Sem dados |
| **remotive** | 0 | — | — | ⚠️ Sem dados |
| **weworkremotely** | 0 | — | — | ⚠️ Sem dados |
| **ziprecruiter** | 0 | — | — | ⚠️ Sem dados |
| **TOTAL** | **180** | **en:46, pt:134** | **50%** | — |

## Bugs corrigidos no smoke

1. **Heading inline** (BNE, MichaelPage): description em 1 linha só.
   Regex de cabeçalho só batia em início de linha. Liberei pra também
   bater após `.`/`?`/`!`/`:`/`;` (com ou sem espaço).
2. **Heading colado** (Gupy): `tecnologia.Responsabilidades`. Idem,
   incluí `\s*` no lookbehind. Gupy saltou de 0% → 93%.
3. **Tail flexível**: era `\s*$` (exige fim de linha). Agora aceita
   `:`/`-` OR fim-de-linha OR whitespace seguido de texto (lookahead).
4. **Detecção de idioma**: `pt if pt >= en else en` favorecia PT quando
   `pt=0` e `en>0` mas abaixo do limite de 3 EN markers. Agora se
   `pt=0 and en>0` retorna `en`. Indeed em inglês passa a ser detectado.

## O trade-off do formatter (sub-PR 4.8)

A decisão atual de produto (registrada no roadmap v3.0.0): quando
`responsibilities IS NULL`, o card vai sem corpo de texto.

Com a heurística atual em **50% de extração média**:
- 50% das vagas vão ter card com `responsibilities` extraído (limpo, sem ruído).
- 50% das vagas vão ter card **sem corpo de texto** (só título, empresa, local, skills, link).

Engines mais afetadas (cards "secos"):
- careerjet: 100% sem corpo
- indeed: 87% sem corpo
- jooble: 80% sem corpo
- bne: 73% sem corpo

## Caminhos possíveis

**A. Aceitar 50% e ativar formatter sem fallback (decisão atual).**
- Pro: card limpo quando tem extracted; pressiona heurística a evoluir.
- Contra: cliente recebe muito card "seco" nas engines fracas.

**B. Reverter decisão: usar description completa (truncada) como fallback.**
- Pro: zero regressão; cliente continua tendo conteúdo.
- Contra: mistura "sobre empresa" + benefícios + requisitos nos cards
  fracos (volta ao estado pré-épico nessas vagas).

**C. Hot-fix nas engines fracas antes de ativar.**
- Investigar amostras de indeed/careerjet/bne pra adicionar marcadores
  ou ajustar heurística específica.
- Atrasa o sub-PR 4.8 mas entrega melhor.

## Recomendação

Combinação de B + C: ativar fallback como **rede de segurança** (descrição
completa, mas truncada em ~600 chars) E continuar melhorando a heurística.
Quando uma engine atinge >80%, podemos remover o fallback dela.

## Engines sem vagas no banco

5 engines (simplyhired, remoteok, remotive, weworkremotely, ziprecruiter)
não trouxeram nenhuma vaga no banco. Possíveis razões:
- Engine nunca rodou desde a feature
- Source name diferente no banco vs no código
- Engine só roda quando configurada por env var (ex: `DICE_FETCH_DETAIL`)

Validar manualmente antes de marcar épico como concluído.
