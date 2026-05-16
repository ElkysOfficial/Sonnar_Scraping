---
title: Hospedagem em Pterodactyl
tags: [infra, hosting, pterodactyl, whatsapp]
updated: 2026-05-16
---

# Hospedagem em Pterodactyl

Painel usado para rodar o [[../08-backend/whatsapp-sender-bot]] (e potencialmente
outros bots/APIs). Painel de gerenciamento de servidores: Console, Files,
Databases, Startup, Backups, Scheduler, Users, Activity.

## Criar servidor para o bot

- **Método de hospedagem:** `Linguagens` → Node.js (projeto próprio).
- Localização + plano (CPU/RAM/disco).

## Deploy dos arquivos

1. Compactar o projeto em `.zip` **sem `node_modules`**.
2. **Files** → Upload do `.zip` → três pontinhos → `Unarchive`.
3. Se criou subpasta, mover conteúdo para a raiz (`Move` → destino `..`),
   depois deletar `.zip` e a pasta vazia.

## Startup

- Instalação de módulos ativada → painel roda `npm install` via `package.json`.
- Start command: `npm start`.
- APIs: a porta do `app.listen` deve bater com a porta atribuída pelo painel
  (exibida no Console).

## Operação

- Console: ligar/reiniciar/parar; pareamento WhatsApp mostra QR Code ou código
  de pareamento (inserir em `Aparelhos Conectados → Conectar com número`).
- **Scheduler:** criar agendamento de `Restart server` a cada 24h para evitar
  sobrecarga de cache e manter o bot estável.
- **Backups:** cópia do servidor; suporta lock (cadeado), download, restore.
- **Activity:** registra ações no painel — útil para auditar sub-usuários.

## Referências

- Guia operacional completo: `OPERACAO.md` na raiz do repositório
- Bot hospedado: [[../08-backend/whatsapp-sender-bot]]
