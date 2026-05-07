<template>
  <div class="admin-layout">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <router-link to="/" class="logo-link">
          <div class="logo-mark">S</div>
          <span class="logo-text">Sonnar</span>
        </router-link>
      </div>

      <nav class="sidebar-nav">
        <div class="nav-group">
          <router-link to="/admin" class="nav-item" :class="{ active: isRoute('/admin') }" exact>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
            Visão Geral
          </router-link>
        </div>

        <div class="nav-group">
          <span class="nav-group-label">Assinantes</span>

          <router-link to="/admin/subscribers" class="nav-item" :class="{ active: isRoute('/admin/subscribers') }">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
            Lista de Assinantes
          </router-link>

          <router-link to="/admin/new-client" class="nav-item" :class="{ active: isRoute('/admin/new-client') }">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
            </svg>
            Novo Cliente
          </router-link>
        </div>

        <div class="nav-group">
          <span class="nav-group-label">Engine de Coleta</span>

          <router-link to="/admin/scraper" class="nav-item" :class="{ active: isRoute('/admin/scraper') }">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
            </svg>
            Observabilidade
          </router-link>
        </div>

        <div class="nav-group">
          <span class="nav-group-label">Administração</span>

          <router-link
            v-if="isOwner"
            to="/admin/admins"
            class="nav-item"
            :class="{ active: isRoute('/admin/admins') }"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
            Administradores
          </router-link>

          <router-link to="/change-password" class="nav-item" :class="{ active: isRoute('/change-password') }">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            Alterar Senha
          </router-link>
        </div>
      </nav>

      <div class="sidebar-footer">
        <div class="user-info">
          <div class="user-avatar">
            {{ userInitials }}
          </div>
          <div class="user-details">
            <span class="user-name">{{ userName }}</span>
            <span class="user-role">{{ roleLabel }}</span>
          </div>
        </div>
        <div class="sidebar-actions">
          <ThemeToggle />
          <button @click="handleLogout" class="btn-logout" title="Sair" aria-label="Sair">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
          </button>
        </div>
      </div>
    </aside>

    <!-- Mobile Header -->
    <header class="mobile-header">
      <button
        @click="toggleMobileMenu"
        class="menu-toggle"
        :aria-expanded="showMobileMenu"
        aria-controls="admin-mobile-menu"
        aria-label="Abrir menu administrativo"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>
      <router-link to="/" class="logo-link">
        <div class="logo-mark-sm">S</div>
        <span class="logo-text-sm">Sonnar</span>
      </router-link>
      <div class="mobile-header-actions">
        <ThemeToggle />
        <button @click="handleLogout" class="btn-logout-mobile" title="Sair" aria-label="Sair">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
          </svg>
        </button>
      </div>
    </header>

    <!-- Mobile Menu Overlay -->
    <Transition name="motion-drawer">
      <div
        v-if="showMobileMenu"
        ref="mobileMenuRef"
        class="mobile-menu-overlay motion-drawer-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Menu administrativo"
        tabindex="-1"
        @click="closeMobileMenu"
        @keydown.esc="closeMobileMenu"
      >
      <nav id="admin-mobile-menu" class="mobile-menu motion-drawer-panel" @click.stop>
        <div class="mobile-menu-header">
          <router-link to="/" class="logo-link" @click="closeMobileMenu">
            <div class="logo-mark">S</div>
            <span class="logo-text">Sonnar</span>
          </router-link>
          <button @click="closeMobileMenu" class="close-menu" data-autofocus aria-label="Fechar menu">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="nav-group">
          <router-link to="/admin" class="nav-item" @click="closeMobileMenu">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
            Visão Geral
          </router-link>
        </div>

        <div class="nav-group">
          <span class="nav-group-label">Assinantes</span>
          <router-link to="/admin/subscribers" class="nav-item" @click="closeMobileMenu">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952" />
            </svg>
            Lista de Assinantes
          </router-link>
          <router-link to="/admin/new-client" class="nav-item" @click="closeMobileMenu">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3" />
            </svg>
            Novo Cliente
          </router-link>
        </div>

        <div class="nav-group">
          <span class="nav-group-label">Engine de Coleta</span>
          <router-link to="/admin/scraper" class="nav-item" @click="closeMobileMenu">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z" />
            </svg>
            Observabilidade
          </router-link>
        </div>

        <div class="nav-group">
          <span class="nav-group-label">Administração</span>
          <router-link v-if="isOwner" to="/admin/admins" class="nav-item" @click="closeMobileMenu">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036" />
            </svg>
            Administradores
          </router-link>
          <router-link to="/change-password" class="nav-item" @click="closeMobileMenu">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75" />
            </svg>
            Alterar Senha
          </router-link>
        </div>
      </nav>
      </div>
    </Transition>

    <!-- Main Content -->
    <main class="main-content">
      <div class="main-scroll">
        <router-view />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useModalFocus } from '@/composables/useModalFocus'
import ThemeToggle from '@/components/ThemeToggle.vue'

const router = useRouter()
const route = useRoute()
const { signOut, user, isOwner, userRole } = useAuth()

const showMobileMenu = ref(false)
const mobileMenuRef = ref<HTMLElement | null>(null)

useModalFocus(showMobileMenu, mobileMenuRef)

const userName = computed(() => {
  return user.value?.user_metadata?.full_name || user.value?.email?.split('@')[0] || 'Admin'
})

const userInitials = computed(() => {
  const name = userName.value
  return name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
})

const roleLabel = computed(() => {
  if (userRole.value === 'owner') return 'Owner'
  if (userRole.value === 'admin') return 'Administrador'
  return 'Usuário'
})

function isRoute(path: string): boolean {
  if (path === '/admin') {
    return route.path === '/admin'
  }
  return route.path.startsWith(path)
}

function toggleMobileMenu() {
  showMobileMenu.value = !showMobileMenu.value
}

function closeMobileMenu() {
  showMobileMenu.value = false
}

async function handleLogout() {
  await signOut()
  router.push('/')
}
</script>

<style scoped>
/* ============================================================
   Admin Layout — Design System (Linear / Vercel inspired)
   - Sidebar: 248px / mobile-header: 56px / content: 24px
   - Tipografia: nav 14px/500, label 11px/600 uppercase
   - Spacing: 4 / 8 / 12 / 16 / 24
   ============================================================ */

.admin-layout {
  height: 100dvh;
  display: flex;
  background: var(--color-background);
  color: var(--color-text-primary);
  overflow: hidden;
  font-family: var(--font-family);
}

/* Sidebar */
.sidebar {
  width: 248px;
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: var(--z-fixed);
}

.sidebar-header {
  padding: 0 16px;
  border-bottom: 1px solid var(--color-border);
  height: 56px;
  display: flex;
  align-items: center;
  box-sizing: border-box;
}

.logo-link {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  letter-spacing: -0.015em;
}

.logo-mark {
  width: 28px;
  height: 28px;
  background: var(--color-accent);
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: var(--color-on-accent, #fff);
  font-weight: var(--font-bold);
  font-size: 13px;
  flex-shrink: 0;
  box-shadow: 0 1px 0 rgba(255,255,255,0.06) inset, 0 4px 10px -3px var(--color-primary-glow);
}

.logo-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.sidebar-nav {
  flex: 1;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  overflow-x: hidden;
}

.nav-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-group-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0 10px;
  margin-bottom: 4px;
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--color-text-secondary);
  text-decoration: none;
  transition: background-color 120ms ease, color 120ms ease;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-item svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.nav-item:hover {
  background: var(--color-glass-bg);
  color: var(--color-text-primary);
}

.nav-item.active,
.nav-item.router-link-active {
  background: var(--color-accent-soft);
  color: var(--color-accent);
  font-weight: 600;
}

.nav-item.active::before,
.nav-item.router-link-active::before {
  content: '';
  position: absolute;
  left: -8px;
  top: 6px;
  bottom: 6px;
  width: 3px;
  background: var(--color-accent);
  border-radius: 0 3px 3px 0;
}

.sidebar-footer {
  padding: 12px;
  border-top: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.user-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--color-accent);
  color: var(--color-on-accent, #fff);
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: var(--font-semibold);
  flex-shrink: 0;
}

.user-details {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.25;
  gap: 1px;
}

.user-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-role {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-accent);
  font-weight: 600;
}

.sidebar-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.btn-logout {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease;
}

.btn-logout svg { width: 16px; height: 16px; }

.btn-logout:hover {
  color: var(--color-error);
  background: var(--color-error-soft);
  border-color: var(--color-error);
}

/* Mobile Header */
.mobile-header {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 56px;
  background: var(--color-background);
  border-bottom: 1px solid var(--color-border);
  padding: 0 16px;
  align-items: center;
  justify-content: space-between;
  z-index: var(--z-fixed);
  box-sizing: border-box;
}

.menu-toggle {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  color: var(--color-text-primary);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 150ms ease, border-color 150ms ease;
}
.menu-toggle:hover { background: var(--color-glass-bg); border-color: var(--color-text-muted); }
.menu-toggle svg { width: 18px; height: 18px; }

.logo-mark-sm {
  width: 26px;
  height: 26px;
  background: var(--color-accent);
  border-radius: 7px;
  display: grid;
  place-items: center;
  color: var(--color-on-accent, #fff);
  font-weight: var(--font-bold);
  font-size: 12px;
}

.logo-text-sm {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  letter-spacing: -0.015em;
}

.mobile-header-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-logout-mobile {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 150ms ease;
}
.btn-logout-mobile svg { width: 16px; height: 16px; }
.btn-logout-mobile:hover {
  color: var(--color-error);
  background: var(--color-error-soft);
  border-color: var(--color-error);
}

/* Mobile Menu Overlay */
.mobile-menu-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  z-index: var(--z-modal);
}

.mobile-menu {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: min(280px, 86vw);
  background: var(--color-surface);
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

.mobile-menu-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  padding: 8px 8px 16px;
  border-bottom: 1px solid var(--color-border);
}

.close-menu {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 150ms ease;
}
.close-menu svg { width: 16px; height: 16px; }
.close-menu:hover { color: var(--color-text-primary); background: var(--color-glass-bg); }

/* Main Content */
.main-content {
  flex: 1;
  margin-left: 248px;
  display: flex;
  flex-direction: column;
  height: 100dvh;
  overflow: hidden;
}

.main-scroll {
  flex: 1;
  min-height: 0;
  padding: 24px;
  overflow-y: auto;
  overflow-x: hidden;
}

/* Scrollbar refinada */
.sidebar-nav::-webkit-scrollbar,
.main-scroll::-webkit-scrollbar,
.mobile-menu::-webkit-scrollbar { width: 8px; height: 8px; }
.sidebar-nav::-webkit-scrollbar-thumb,
.main-scroll::-webkit-scrollbar-thumb,
.mobile-menu::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 4px;
}
.sidebar-nav::-webkit-scrollbar-thumb:hover,
.main-scroll::-webkit-scrollbar-thumb:hover,
.mobile-menu::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-muted);
}
.sidebar-nav::-webkit-scrollbar-track,
.main-scroll::-webkit-scrollbar-track,
.mobile-menu::-webkit-scrollbar-track { background: transparent; }

@media (max-width: 768px) {
  .sidebar { display: none; }
  .mobile-header { display: flex; }
  .mobile-menu-overlay { display: block; }
  .main-content {
    margin-left: 0;
    padding-top: 56px;
  }
  .main-scroll { padding: 16px; }
}
</style>
