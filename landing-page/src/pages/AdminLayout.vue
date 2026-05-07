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

      <nav class="dl-nav" aria-label="Navegação do admin">
        <div v-for="(group, gi) in visibleGroups" :key="gi" class="dl-nav-group">
          <span v-if="group.label" class="dl-nav-group__label">{{ group.label }}</span>
          <router-link
            v-for="item in group.items"
            :key="item.to"
            :to="item.to"
            class="dl-nav__link"
            :class="{ 'dl-nav__link--active': isActive(item.to, item.exact) }"
            @click="closeMobile"
          >
            <span class="dl-nav__icon" v-html="item.icon"></span>
            <span class="dl-nav__label">{{ item.label }}</span>
          </router-link>
        </div>
      </nav>

      <div class="dl-side__foot">
        <div class="dl-userchip">
          <span class="dl-avatar">{{ initials }}</span>
          <span class="dl-userchip__meta">
            <span class="dl-userchip__name">{{ userName }}</span>
            <span class="dl-userchip__plan">{{ roleLabel }}</span>
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
          <span class="dl-admin-badge" v-if="userRole === 'owner'">Owner</span>
          <span class="dl-admin-badge" v-else-if="userRole === 'admin'">Admin</span>
          <ThemeToggle />
        </div>
      </header>

      <main class="dl-content">
        <router-view v-slot="{ Component }">
          <transition name="dl-fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
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
const { signOut, user, isOwner, userRole } = useAuth()

const collapsed = ref(false)
const mobileOpen = ref(false)
const isMobile = ref(false)

const navGroups = computed(() => [
  {
    label: '',
    items: [
      {
        to: '/admin',
        label: 'Visão Geral',
        exact: true,
        icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="7" height="9" rx="1.5" />
          <rect x="14" y="3" width="7" height="5" rx="1.5" />
          <rect x="14" y="12" width="7" height="9" rx="1.5" />
          <rect x="3" y="16" width="7" height="5" rx="1.5" />
        </svg>`
      }
    ]
  },
  {
    label: 'Coleta',
    items: [
      {
        to: '/admin/scraper',
        label: 'Coleta de Vagas',
        icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="6" opacity="0.55" />
          <circle cx="12" cy="12" r="3" opacity="0.3" />
          <line x1="12" y1="12" x2="18" y2="7" />
          <circle cx="17.2" cy="7.6" r="1.6" fill="currentColor" stroke="none" />
        </svg>`
      }
    ]
  },
  {
    label: 'Assinantes',
    items: [
      {
        to: '/admin/subscribers',
        label: 'Lista de Assinantes',
        icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="9" cy="8" r="3.4" />
          <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
          <circle cx="17.5" cy="9" r="2.6" />
          <path d="M14.5 14.6A5.4 5.4 0 0 1 21.5 20" />
        </svg>`
      },
      {
        to: '/admin/new-client',
        label: 'Novo Cliente',
        icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="9" cy="8" r="3.4" />
          <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
          <line x1="19" y1="6" x2="19" y2="12" />
          <line x1="16" y1="9" x2="22" y2="9" />
        </svg>`
      }
    ]
  },
  {
    label: 'Administração',
    items: [
      ...(isOwner.value ? [{
        to: '/admin/admins',
        label: 'Administradores',
        icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 2.5l8 3.5v6c0 4.6-3.2 8.7-8 10-4.8-1.3-8-5.4-8-10v-6l8-3.5z" />
          <path d="M9 12.5l2 2 4-4" />
        </svg>`
      }] : []),
      {
        to: '/change-password',
        label: 'Alterar Senha',
        icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>`
      }
    ]
  }
])

const visibleGroups = computed(() => navGroups.value.filter(g => g.items.length > 0))

const pageTitle = computed(() => (route.meta.title as string) ?? 'Admin')
const pageSubtitle = computed(() => (route.meta.subtitle as string) ?? '')

const userName = computed(() => {
  const u: any = user.value
  return u?.user_metadata?.full_name || u?.email?.split('@')[0] || 'Admin'
})

const initials = computed(() => {
  const name = userName.value as string
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
})

const roleLabel = computed(() => {
  if (userRole.value === 'owner') return 'Owner'
  if (userRole.value === 'admin') return 'Administrador'
  return 'Usuário'
})

function isActive(path: string, exact = false) {
  if (exact) return route.path === path
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
  router.push('/')
}

watch(() => route.path, () => closeMobile())

onMounted(() => {
  checkViewport()
  window.addEventListener('resize', checkViewport, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('resize', checkViewport)
})
</script>

<style scoped>
/* Admin Layout — espelho do DashboardLayout (cliente) com grupos de nav. */

.dl {
  height: 100dvh;
  background: var(--color-background);
  color: var(--color-text-primary);
  display: grid;
  grid-template-columns: 248px 1fr;
  overflow: hidden;
  font-family: var(--font-family);
}

.dl:has(.dl-side--collapsed) {
  grid-template-columns: 64px 1fr;
}

@media (max-width: 767px) {
  .dl { grid-template-columns: 1fr; }
}

.dl-side {
  position: relative;
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  height: 100dvh;
  transition: width var(--transition-base) cubic-bezier(0.32, 0.72, 0, 1);
  z-index: var(--z-fixed);
}

.dl-side--collapsed { width: 64px; }
.dl-side--collapsed .dl-nav__label,
.dl-side--collapsed .dl-brand__text,
.dl-side--collapsed .dl-userchip__meta,
.dl-side--collapsed .dl-nav-group__label { display: none; }
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
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  height: 56px;
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

.dl-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-2);
  overflow-y: auto;
  overflow-x: hidden;
}

.dl-nav-group { display: flex; flex-direction: column; gap: 2px; }
.dl-nav-group__label {
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: var(--ls-wide);
  padding: 0 var(--space-3);
  margin-bottom: var(--space-1);
}

.dl-nav__link {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  line-height: 1.4;
  text-decoration: none;
  transition: all var(--transition-fast);
  cursor: pointer;
  background: transparent;
  border: none;
  text-align: left;
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
}

.dl-nav__link:hover {
  background: var(--color-surface-elevated);
  color: var(--color-text-primary);
}

.dl-nav__link--active {
  background: var(--color-accent-soft);
  color: var(--color-accent);
  font-weight: var(--font-semibold);
}

.dl-nav__link--active::before {
  content: '';
  position: absolute;
  left: calc(-1 * var(--space-2));
  top: var(--space-2);
  bottom: var(--space-2);
  width: 3px;
  background: var(--color-accent);
  border-radius: 0 3px 3px 0;
}

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

.dl-side__foot {
  border-top: 1px solid var(--color-border);
  padding: var(--space-3) var(--space-2);
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

.dl-scrim {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  z-index: var(--z-modal-backdrop);
}

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
  border-bottom: 1px solid var(--color-border);
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
  margin: 1px 0 0;
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

.dl-admin-badge {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 8px;
  border-radius: var(--radius-sm);
  background: var(--color-accent-soft);
  color: var(--color-accent);
  font-size: 10px;
  font-weight: var(--font-bold);
  text-transform: uppercase;
  letter-spacing: var(--ls-wide);
}

.dl-content {
  flex: 1;
  min-height: 0;
  padding: var(--space-5) var(--space-6);
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
  overflow-y: auto;
  overflow-x: hidden;
}

@media (max-width: 767px) {
  .dl-topbar { padding: 0 var(--space-4); }
  .dl-content { padding: var(--space-4); }
}

.dl-nav::-webkit-scrollbar,
.dl-content::-webkit-scrollbar { width: 8px; height: 8px; }
.dl-nav::-webkit-scrollbar-thumb,
.dl-content::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 4px;
}
.dl-nav::-webkit-scrollbar-thumb:hover,
.dl-content::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-muted);
}
.dl-nav::-webkit-scrollbar-track,
.dl-content::-webkit-scrollbar-track { background: transparent; }

.dl-fade-enter-active,
.dl-fade-leave-active {
  transition: opacity 180ms ease;
}
.dl-fade-enter-from,
.dl-fade-leave-to { opacity: 0; }
</style>
