<template>
  <div class="dl">
    <!-- ============== SIDEBAR ============== -->
    <aside
      class="dl-side"
      :class="{ 'dl-side--collapsed': collapsed && !mobileOpen, 'dl-side--mobile-open': mobileOpen }"
      :aria-hidden="isMobile && !mobileOpen"
    >
      <header class="dl-side__head">
        <router-link to="/" class="dl-brand" aria-label="Sonnar - Início">
          <span class="dl-logo">S</span>
          <span class="dl-brand__text">Sonnar</span>
        </router-link>

        <button
          v-if="isMobile"
          class="dl-icon-btn"
          aria-label="Fechar menu"
          @click="closeMobile"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
      </header>

      <nav class="dl-nav" aria-label="Navegação do painel">
        <router-link
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="dl-nav__link"
          :class="{ 'dl-nav__link--active': isActive(item.to) }"
          @click="closeMobile"
        >
          <span class="dl-nav__icon" v-html="item.icon"></span>
          <span class="dl-nav__label">{{ item.label }}</span>
        </router-link>
      </nav>

      <div class="dl-side__foot">
        <div class="dl-userchip" v-if="subscriber">
          <span class="dl-avatar">{{ initials }}</span>
          <span class="dl-userchip__meta">
            <span class="dl-userchip__name">{{ subscriber.name }}</span>
            <span class="dl-userchip__plan">{{ planLabel }}</span>
          </span>
        </div>

        <button class="dl-nav__link dl-logout" @click="onLogout">
          <span class="dl-nav__icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </span>
          <span class="dl-nav__label">Sair</span>
        </button>
      </div>

      <!-- Toggle de colapso (apenas desktop) -->
      <button
        v-if="!isMobile"
        class="dl-collapse"
        :aria-label="collapsed ? 'Expandir menu' : 'Recolher menu'"
        @click="collapsed = !collapsed"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline :points="collapsed ? '9 18 15 12 9 6' : '15 18 9 12 15 6'" />
        </svg>
      </button>
    </aside>

    <!-- Scrim mobile -->
    <Transition name="dl-fade">
      <div v-if="isMobile && mobileOpen" class="dl-scrim" aria-hidden="true" @click="closeMobile"></div>
    </Transition>

    <!-- ============== MAIN ============== -->
    <div class="dl-main" :class="{ 'dl-main--with-collapsed': collapsed && !isMobile }">
      <header class="dl-topbar">
        <button
          v-if="isMobile"
          class="dl-icon-btn"
          aria-label="Abrir menu"
          @click="mobileOpen = true"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="13" x2="20" y2="13" />
            <line x1="4" y1="19" x2="14" y2="19" />
          </svg>
        </button>

        <div class="dl-topbar__title">
          <h1>{{ pageTitle }}</h1>
          <p v-if="pageSubtitle">{{ pageSubtitle }}</p>
        </div>

        <div class="dl-topbar__actions">
          <ThemeToggle />
        </div>
      </header>

      <main class="dl-content">
        <div class="dl-content__inner">
          <router-view v-slot="{ Component }">
            <transition name="dl-fade" mode="out-in">
              <component :is="Component" />
            </transition>
          </router-view>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import ThemeToggle from '@/components/ThemeToggle.vue'

const route = useRoute()
const router = useRouter()
const { subscriber, signOut } = useAuth()

const collapsed = ref(true)
const mobileOpen = ref(false)
const isMobile = ref(false)

// Ícones inline - alinhados com a metáfora Sonnar (radar/sinal/perfil)
const navItems = [
  {
    to: '/dashboard/vagas',
    label: 'Vagas',
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="6" opacity="0.55" />
      <circle cx="12" cy="12" r="3" opacity="0.3" />
      <line x1="12" y1="12" x2="18" y2="7" />
      <circle cx="17.2" cy="7.6" r="1.6" fill="currentColor" stroke="none" />
    </svg>`
  },
  {
    to: '/dashboard/curriculo',
    label: 'Currículo',
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="13" y2="17" />
    </svg>`
  },
  {
    to: '/dashboard/consultoria',
    label: 'Consultoria',
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
    </svg>`
  },
  {
    to: '/dashboard/configuracoes',
    label: 'Configurações',
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>`
  }
]

const pageTitle = computed(() => (route.meta.title as string) ?? 'Painel')
const pageSubtitle = computed(() => (route.meta.subtitle as string) ?? '')

const planLabel = computed(() => ({
  free: 'Comunidade',
  pro: 'Pro',
  plus: 'Plus'
}[subscriber.value?.plan || 'free']))

const initials = computed(() => {
  const name = subscriber.value?.name || 'U'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
})

function isActive(path: string) {
  return route.path === path || route.path.startsWith(`${path}/`)
}

function checkViewport() {
  isMobile.value = window.innerWidth < 768
  if (!isMobile.value) mobileOpen.value = false
}

function closeMobile() {
  mobileOpen.value = false
}

async function onLogout() {
  await signOut()
  router.push('/login')
}

watch(() => route.path, () => closeMobile())

onMounted(() => {
  // Auth já é validada pelo authGuard do router. Nenhuma checagem aqui
  // pra evitar race com o bootstrap reativo do useAuth singleton.
  checkViewport()
  window.addEventListener('resize', checkViewport, { passive: true })
  // Trava a rolagem da janela: o dashboard rola só dentro do .dl-content.
  // Sem isto, altura extra injetada pelo runtime do AdSense gera scroll de
  // página e a sidebar descola do conteúdo.
  document.body.style.overflow = 'hidden'
})

onUnmounted(() => {
  window.removeEventListener('resize', checkViewport)
  document.body.style.overflow = ''
})
</script>

<style scoped>
/* Dashboard Layout - alinhado ao Design System Sonnar v2.0 */

.dl {
  /* Fixado na viewport. O runtime do AdSense pode injetar altura e forçar
     rolagem no nível da janela; com o layout em fluxo normal, a sidebar
     (só 100dvh de altura) rolava junto e descolava do topo, deixando um
     vazio embaixo. Fixo, o shell inteiro fica preso à tela e apenas o
     .dl-content rola. Espelha a sidebar fixa do AdminLayout. */
  position: fixed;
  inset: 0;
  background: var(--color-background);
  color: var(--color-text-primary);
  display: grid;
  grid-template-columns: var(--sidebar-width) 1fr;
  overflow: hidden;
  font-family: var(--font-family);
}

.dl:has(.dl-side--collapsed) {
  grid-template-columns: var(--sidebar-collapsed) 1fr;
}

@media (max-width: 767px) {
  .dl { grid-template-columns: 1fr; }
}

/* =========== SIDEBAR =========== */
.dl-side {
  position: relative;
  background: var(--color-background);
  border-right: 1px solid var(--color-border-subtle);
  display: flex;
  flex-direction: column;
  height: 100dvh;
  transition: width var(--transition-base) cubic-bezier(0.32, 0.72, 0, 1);
  z-index: var(--z-fixed);
}

.dl-side--collapsed { width: var(--sidebar-collapsed); }
.dl-side--collapsed .dl-nav__label,
.dl-side--collapsed .dl-brand__text,
.dl-side--collapsed .dl-userchip__meta { display: none; }
.dl-side--collapsed .dl-side__head { padding: 0; justify-content: center; }
.dl-side--collapsed .dl-brand { gap: 0; justify-content: center; width: 100%; }
.dl-side--collapsed .dl-userchip { justify-content: center; padding: 0; background: transparent; border-color: transparent; }
.dl-side--collapsed .dl-nav__link { justify-content: center; padding: var(--space-2) 0; }
.dl-side--collapsed .dl-side__foot { padding: var(--space-3) var(--space-2); }
.dl-side--collapsed .dl-nav__link--active::before { display: none; }

@media (max-width: 767px) {
  .dl-side {
    position: fixed;
    top: 0;
    left: 0;
    width: min(280px, 86vw);
    transform: translateX(-100%);
    transition: transform 280ms cubic-bezier(0.32, 0.72, 0, 1);
    box-shadow: var(--shadow-lg);
  }
  .dl-side--mobile-open { transform: translateX(0); }
}

.dl-side__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-4);
  flex-shrink: 0;
  height: var(--header-height);
  box-sizing: border-box;
}

.dl-brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  text-decoration: none;
  color: var(--color-text-primary);
  font-weight: var(--font-bold);
  letter-spacing: var(--ls-tight);
  white-space: nowrap;
  min-width: 0;
}

.dl-logo {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  background: var(--color-accent);
  color: var(--color-text-inverse);
  border-radius: var(--radius-md);
  font-weight: var(--font-bold);
  font-size: var(--text-sm);
  box-shadow: var(--shadow-sm);
}

.dl-brand__text {
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
}

.dl-icon-btn {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.dl-icon-btn:hover {
  background: var(--color-surface);
  color: var(--color-text-primary);
  border-color: var(--color-text-muted);
}

/* Nav */
.dl-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-2) var(--space-3);
  overflow-y: auto;
  overflow-x: hidden;
}

.dl-nav__link {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  line-height: 1.4;
  text-decoration: none;
  transition: background var(--transition-fast), color var(--transition-fast);
  cursor: pointer;
  background: transparent;
  border: none;
  text-align: left;
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
  min-height: 36px;
}

.dl-nav__link:hover {
  background: var(--color-surface);
  color: var(--color-text-primary);
}

.dl-nav__link--active {
  background: var(--color-surface);
  color: var(--color-text-primary);
  font-weight: var(--font-semibold);
}

.dl-nav__link--active .dl-nav__icon { color: var(--color-accent); }

.dl-nav__icon {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
.dl-nav__icon svg { width: 18px; height: 18px; }

.dl-nav__label {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Footer */
.dl-side__foot {
  border-top: 1px solid var(--color-border-subtle);
  padding: var(--space-2) var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  flex-shrink: 0;
}

.dl-userchip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  margin-bottom: var(--space-1);
}

.dl-avatar {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  background: var(--color-accent);
  color: var(--color-text-inverse);
  display: grid;
  place-items: center;
  font-weight: var(--font-semibold);
  font-size: var(--text-xs);
}

.dl-userchip__meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.25;
  gap: 1px;
}

.dl-userchip__name {
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 150px;
}

.dl-userchip__plan {
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: var(--ls-wide);
  color: var(--color-accent);
  font-weight: var(--font-semibold);
}

.dl-logout { color: var(--color-text-muted); }
.dl-logout:hover { color: var(--color-error); background: var(--color-error-soft); }

/* Botão de colapso */
.dl-collapse {
  position: absolute;
  top: 70px;
  right: -10px;
  width: 20px;
  height: 20px;
  border-radius: var(--radius-full);
  background: var(--color-background);
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: all var(--transition-fast);
  z-index: 5;
  box-shadow: var(--shadow-sm);
}
.dl-collapse:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
}

/* Scrim mobile */
.dl-scrim {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  z-index: var(--z-modal-backdrop);
}

/* =========== MAIN =========== */
.dl-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100dvh;
  overflow: hidden;
}

.dl-topbar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 0 var(--space-6);
  border-bottom: 1px solid var(--color-border-subtle);
  background: var(--color-background);
  z-index: var(--z-sticky);
  height: 56px;
  flex-shrink: 0;
  box-sizing: border-box;
}

.dl-topbar__title {
  flex: 1;
  display: flex;
  flex-direction: column;
  line-height: var(--lh-title);
  min-width: 0;
}

.dl-topbar__title h1 {
  font-size: var(--text-base);
  font-weight: var(--font-semibold);
  letter-spacing: var(--ls-tight);
  margin: 0;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dl-topbar__title p {
  font-size: var(--text-xs);
  font-weight: var(--font-normal);
  color: var(--color-text-muted);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dl-topbar__actions {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

.dl-content {
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow-y: auto;
  overflow-x: hidden;
}

.dl-content__inner {
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
  padding: var(--space-5) var(--space-6);
  box-sizing: border-box;
}

@media (max-width: 767px) {
  .dl-topbar { padding: 0 var(--space-4); }
  .dl-content__inner { padding: var(--space-4); }
}

/* Scrollbar — fina e sem setas (Windows mostra setas no default; aqui escondemos) */
.dl-nav, .dl-content {
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-subtle) transparent;
}
.dl-nav::-webkit-scrollbar,
.dl-content::-webkit-scrollbar { width: 6px; height: 6px; }
.dl-nav::-webkit-scrollbar-thumb,
.dl-content::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 3px;
}
.dl-nav::-webkit-scrollbar-thumb:hover,
.dl-content::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-muted);
}
.dl-nav::-webkit-scrollbar-track,
.dl-content::-webkit-scrollbar-track { background: transparent; }
.dl-nav::-webkit-scrollbar-button,
.dl-content::-webkit-scrollbar-button { display: none; height: 0; width: 0; }

/* Transitions */
.dl-fade-enter-active,
.dl-fade-leave-active {
  transition: opacity 180ms ease;
}
.dl-fade-enter-from,
.dl-fade-leave-to { opacity: 0; }
</style>
