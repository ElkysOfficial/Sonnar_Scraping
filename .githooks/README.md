# Git hooks

Hooks versionados deste repositório.

## Ativação (cada clone precisa rodar uma vez)

```bash
git config core.hooksPath .githooks
```

No Windows/PowerShell:
```powershell
git config core.hooksPath .githooks
```

Em sistemas Unix, garanta que os scripts são executáveis:
```bash
chmod +x .githooks/*
```

## Hooks disponíveis

- **`pre-push`** — valida que o nome da branch segue git-flow estendido (`feature/`, `release/`, `hotfix/`, `bugfix/`, `support/`, `chore/`, `docs/` + slug kebab-case). Branches `main`/`develop`/`master` são ignoradas.

## Por que não rodar automaticamente?

O Git não propaga hooks no clone por motivo de segurança — caso contrário, clonar um repo executaria scripts arbitrários. Por isso a configuração `core.hooksPath` é manual e por clone.
