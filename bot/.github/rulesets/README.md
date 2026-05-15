# GitHub Rulesets

Rulesets para proteger branches deste repositório. Importe pela UI ou via API do GitHub.

## Arquivos

- `main.json` — Proteção estrita da `main`: PR obrigatório (1 aprovação + last-push approval), histórico linear, commits assinados, Conventional Commits, sem force-push nem deleção.
- `develop.json` — Proteção moderada da `develop`: PR obrigatório, Conventional Commits, sem force-push nem deleção. Permite rebase merge.
- `feature-branches.json` — Padrão de nomenclatura para branches de trabalho: `feature/`, `fix/`, `hotfix/`, `chore/`, `docs/`, `refactor/`, `test/` seguidos de slug em kebab-case.

## Como importar

### Via UI
`Settings` → `Rules` → `Rulesets` → `New ruleset` → `Import a ruleset` → selecione o arquivo JSON.

### Via API
```bash
gh api \
  --method POST \
  -H "Accept: application/vnd.github+json" \
  /repos/<owner>/<repo>/rulesets \
  --input .github/rulesets/main.json
```

## Notas

- `bypass_actors` referencia `actor_id: 5` / `actor_type: RepositoryRole` (admin), com `bypass_mode: always`. Em repo pessoal, isso equivale **somente ao dono** (LucelhoSilva). A API de rulesets não suporta bypass por usuário individual — `RepositoryRole` admin é o caminho correto.
- O padrão de Conventional Commits aceita: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`, `revert`, com escopo opcional e `!` para breaking changes.
- **Status checks (CI):** não há workflows em `.github/workflows/` ainda, então `required_status_checks` foi omitido. Quando criar o pipeline, adicione um bloco como o exemplo abaixo a `main.json` e `develop.json` dentro de `rules`:

```json
{
  "type": "required_status_checks",
  "parameters": {
    "strict_required_status_checks_policy": true,
    "required_status_checks": [
      { "context": "lint",  "integration_id": 15368 },
      { "context": "tests", "integration_id": 15368 }
    ]
  }
}
```
`integration_id: 15368` é o GitHub Actions. `context` é o nome do job no workflow (ex.: `jobs.lint.name`). `strict_required_status_checks_policy: true` exige branch atualizada antes do merge.
