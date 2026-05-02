# Obsidian shared config

Esta pasta contém a **configuração compartilhada** do vault: tema, plugins core ativados, hotkeys (incluindo `Ctrl+G` para Graph view) e defaults do grafo.

## O que é versionado

- `app.json` — preferências gerais do vault
- `appearance.json` — defaults de UI (sem forçar tema escuro/claro)
- `core-plugins.json` — quais plugins core ficam ligados
- `community-plugins.json` — plugins community (vazio; cada dev instala se quiser)
- `hotkeys.json` — atalhos customizados (`Ctrl+G` → Graph)
- `graph.json` — defaults do grafo + grupos coloridos por seção

## O que NÃO é versionado (ver `.gitignore` na raiz)

- `workspace.json` — abas/painéis abertos (muda toda hora)
- `workspace-mobile.json` — idem mobile
- `workspaces.json` — workspaces salvos (per-user)
- `cache/` — cache interno
- `plugins/*/data.json` — estado de plugins community

## Como aplicar em uma nova máquina

Basta clonar o repo e abrir `obsidian/` como vault no Obsidian. A config é carregada automaticamente.
