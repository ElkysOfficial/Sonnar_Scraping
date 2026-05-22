<template>
  <!-- Acesso às comunidades públicas — exibido para o plano Comunidade (free),
       que não recebe vagas personalizadas mas tem acesso aos canais abertos. -->
  <section class="comm">
    <header class="comm__head">
      <h2>Entre nas comunidades</h2>
      <p>
        Seu plano Comunidade dá acesso aos canais públicos do Sonnar. Troque
        vagas e dicas com outros devs — entre uma vez e fique por dentro.
      </p>
    </header>

    <div class="comm__links">
      <a
        v-for="c in channels"
        :key="c.id"
        :href="c.url"
        target="_blank"
        rel="noopener noreferrer"
        class="comm-link"
        :class="`comm-link--${c.id}`"
      >
        <span class="comm-link__icon">
          <component :is="c.icon" />
        </span>
        <span class="comm-link__body">
          <span class="comm-link__title">{{ c.title }}</span>
          <span class="comm-link__sub">{{ c.subtitle }}</span>
        </span>
        <svg
          class="comm-link__arrow"
          viewBox="0 0 24 24" width="16" height="16" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          aria-hidden="true"
        >
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </a>
    </div>
  </section>
</template>

<script setup lang="ts">
import { DiscordIcon, WhatsAppIcon } from './icons/SocialIcons.vue'

// Links oficiais das comunidades públicas. Mantidos aqui como fonte única
// para o dashboard — se mudarem, basta editar este array.
const channels = [
  {
    id: 'discord',
    title: 'Discord',
    subtitle: 'Comunidade de desenvolvedores',
    url: 'https://discord.gg/developers-202147515766800384',
    icon: DiscordIcon
  },
  {
    id: 'whatsapp',
    title: 'WhatsApp',
    subtitle: 'Grupo da comunidade',
    url: 'https://chat.whatsapp.com/IcXxMiKwd4Z9bnsn9FsO4j',
    icon: WhatsAppIcon
  }
] as const
</script>

<style scoped>
.comm {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5);
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
}

.comm__head h2 {
  margin: 0 0 var(--space-1);
  font-size: var(--text-lg);
  font-weight: var(--font-semibold);
  letter-spacing: var(--ls-tight);
}
.comm__head p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  line-height: var(--lh-body);
}

.comm__links {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-3);
}
@media (min-width: 640px) {
  .comm__links { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

.comm-link {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  text-decoration: none;
  transition: border-color var(--transition-fast), box-shadow var(--transition-base);
}
.comm-link:hover { box-shadow: var(--shadow-md); }
.comm-link:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.comm-link--discord:hover  { border-color: #5865F2; }
.comm-link--whatsapp:hover { border-color: var(--color-whatsapp); }

.comm-link__icon {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  color: #fff;
  font-size: 20px;
}
.comm-link--discord  .comm-link__icon { background: #5865F2; }
.comm-link--whatsapp .comm-link__icon { background: var(--color-whatsapp); }

.comm-link__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.comm-link__title {
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  color: var(--color-text-primary);
}
.comm-link__sub {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.comm-link__arrow {
  flex-shrink: 0;
  color: var(--color-text-muted);
  transition: transform var(--transition-fast), color var(--transition-fast);
}
.comm-link:hover .comm-link__arrow {
  transform: translateX(3px);
  color: var(--color-text-secondary);
}
</style>
