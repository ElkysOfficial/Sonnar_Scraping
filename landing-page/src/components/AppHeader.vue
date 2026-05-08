<template>
  <header
    class="header"
    :class="{ 'header-scrolled': isScrolled }"
  >
    <div class="container header-content">
      <a
        href="#"
        class="logo"
        aria-label="Sonnar - Início"
      >
        <span class="logo-mark">S</span>
        <span class="logo-text">Sonnar</span>
      </a>

      <!-- Desktop Navigation -->
      <nav
        class="nav-desktop"
        aria-label="Navegação principal"
      >
        <ul class="nav-list">
          <li
            v-for="link in navLinks"
            :key="link.href"
          >
            <a
              :href="link.href"
              class="nav-link"
              :class="{ 'nav-link-active': activeSection === link.href.slice(1) }"
            >
              {{ link.label }}
            </a>
          </li>
        </ul>

        <router-link
          to="/login"
          class="btn nav-login"
        >
          Entrar
        </router-link>

        <router-link
          to="/cadastro"
          class="btn btn-primary nav-cta"
        >
          Começar
        </router-link>

        <button
          class="theme-toggle"
          :aria-label="isDark ? 'Ativar modo claro' : 'Ativar modo escuro'"
          :title="isDark ? 'Modo claro' : 'Modo escuro'"
          @click="toggleTheme"
        >
          <svg v-if="isDark" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="10" cy="10" r="4" stroke="currentColor" stroke-width="1.5" />
            <path d="M10 2V4M10 16V18M18 10H16M4 10H2M15.657 4.343L14.243 5.757M5.757 14.243L4.343 15.657M15.657 15.657L14.243 14.243M5.757 5.757L4.343 4.343" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
          <svg v-else width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </nav>

      <!-- Mobile Trigger -->
      <button
        class="menu-trigger"
        :aria-expanded="isMenuOpen"
        aria-controls="mobile-drawer"
        aria-label="Abrir menu"
        @click="openMenu"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="13" x2="20" y2="13" />
          <line x1="4" y1="19" x2="14" y2="19" />
        </svg>
      </button>
    </div>

    <!-- Mobile Drawer + Scrim -->
    <Transition name="drawer">
      <div
        v-if="isMenuOpen"
        class="drawer-root"
        @keydown.esc="closeMenu"
      >
        <div
          class="drawer-scrim"
          aria-hidden="true"
          @click="closeMenu"
        ></div>

        <aside
          id="mobile-drawer"
          ref="drawer"
          class="drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="drawer-title"
          tabindex="-1"
        >
          <header class="drawer-head">
            <div id="drawer-title" class="drawer-brand">
              <span class="logo-mark">S</span>
              <span class="logo-text">Sonnar</span>
            </div>
            <button
              class="drawer-close"
              aria-label="Fechar menu"
              @click="closeMenu"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            </button>
          </header>

          <nav class="drawer-nav" aria-label="Seções da página">
            <a
              v-for="link in navLinks"
              :key="link.href"
              :href="link.href"
              class="drawer-link"
              :class="{ 'drawer-link-active': activeSection === link.href.slice(1) }"
              @click="closeMenu"
            >
              <span class="drawer-link-label">{{ link.label }}</span>
              <svg class="drawer-link-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </a>
          </nav>

          <footer class="drawer-foot">
            <button
              class="drawer-theme"
              :aria-label="isDark ? 'Ativar modo claro' : 'Ativar modo escuro'"
              @click="toggleTheme"
            >
              <svg v-if="isDark" width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <circle cx="10" cy="10" r="4" stroke="currentColor" stroke-width="1.5" />
                <path d="M10 2V4M10 16V18M18 10H16M4 10H2M15.657 4.343L14.243 5.757M5.757 14.243L4.343 15.657M15.657 15.657L14.243 14.243M5.757 5.757L4.343 4.343" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
              <svg v-else width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <span>{{ isDark ? 'Modo claro' : 'Modo escuro' }}</span>
            </button>

            <div class="drawer-actions">
              <router-link
                to="/login"
                class="drawer-btn drawer-btn--ghost"
                @click="closeMenu"
              >
                Entrar
              </router-link>
              <router-link
                to="/cadastro"
                class="drawer-btn drawer-btn--primary"
                @click="closeMenu"
              >
                Começar agora
              </router-link>
            </div>
          </footer>
        </aside>
      </div>
    </Transition>
  </header>
</template>

<script>
export default {
  name: "AppHeader",
  data() {
    return {
      isScrolled: false,
      isMenuOpen: false,
      activeSection: "",
      isDark: false,
      navLinks: [
        { href: "#como-funciona", label: "Como funciona" },
        { href: "#planos", label: "Planos" },
        { href: "#faq", label: "FAQ" }
      ]
    }
  },
  mounted() {
    window.addEventListener("scroll", this.handleScroll, { passive: true })
    window.addEventListener("resize", this.handleResize)
    this.setupIntersectionObserver()
    this.initTheme()
  },
  beforeUnmount() {
    window.removeEventListener("scroll", this.handleScroll)
    window.removeEventListener("resize", this.handleResize)
    document.body.style.overflow = ""
  },
  methods: {
    handleScroll() {
      this.isScrolled = window.scrollY > 50
    },
    handleResize() {
      // Fechar drawer se virar desktop
      if (window.innerWidth >= 768 && this.isMenuOpen) {
        this.closeMenu()
      }
    },
    openMenu() {
      this.isMenuOpen = true
      document.body.style.overflow = "hidden"
      // Foco para acessibilidade
      this.$nextTick(() => {
        this.$refs.drawer?.focus()
      })
    },
    closeMenu() {
      this.isMenuOpen = false
      document.body.style.overflow = ""
    },
    setupIntersectionObserver() {
      const sections = document.querySelectorAll("section[id]")
      const observer = new IntersectionObserver(
        entries => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              this.activeSection = entry.target.id
            }
          })
        },
        { threshold: 0.3, rootMargin: "-80px 0px -50% 0px" }
      )
      sections.forEach(section => observer.observe(section))
    },
    initTheme() {
      const savedTheme = localStorage.getItem("sonnar-theme")
      const theme = savedTheme || "dark"
      this.isDark = theme === "dark"
      document.documentElement.setAttribute("data-theme", theme)
    },
    toggleTheme() {
      this.isDark = !this.isDark
      const theme = this.isDark ? "dark" : "light"
      document.documentElement.setAttribute("data-theme", theme)
      localStorage.setItem("sonnar-theme", theme)
    }
  }
}
</script>

<style scoped>
/* ==========================================================================
   Header
   ========================================================================== */

.header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: var(--z-fixed);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--color-accent) 10%, var(--header-bg)) 0%,
    color-mix(in srgb, var(--color-accent) 6%, var(--header-bg)) 100%
  );
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition:
    background var(--transition-base),
    border-color var(--transition-base),
    box-shadow var(--transition-base);
  border-bottom: 1px solid color-mix(in srgb, var(--color-accent) 18%, transparent);
}

.header-scrolled {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--color-accent) 14%, var(--header-bg-scrolled)) 0%,
    color-mix(in srgb, var(--color-accent) 8%, var(--header-bg-scrolled)) 100%
  );
  border-bottom-color: color-mix(in srgb, var(--color-accent) 28%, transparent);
  box-shadow: 0 1px 0 color-mix(in srgb, var(--color-accent) 12%, transparent);
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: clamp(3.5rem, 8vh, 4.25rem);
  gap: var(--space-4);
}

/* ==========================================================================
   Logo
   ========================================================================== */

.logo {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-primary);
  position: relative;
  z-index: 10;
  transition: opacity var(--transition-fast);
}

.logo:hover { opacity: 0.85; }

.logo-mark {
  width: 2rem;
  height: 2rem;
  background: var(--color-accent);
  color: var(--color-on-accent, #fff);
  border-radius: var(--radius-md);
  display: grid;
  place-items: center;
  font-weight: var(--font-bold);
  font-size: 0.9375rem;
  box-shadow: 0 4px 12px -4px var(--color-primary-glow);
}

.logo-text {
  font-size: 1.125rem;
  font-weight: var(--font-bold);
  letter-spacing: -0.01em;
}

/* ==========================================================================
   Desktop Navigation (>= 768px)
   ========================================================================== */

.nav-desktop {
  display: none;
  align-items: center;
  gap: var(--space-2);
}

@media (min-width: 768px) {
  .nav-desktop {
    display: flex;
  }
}

.nav-list {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  list-style: none;
  margin: 0;
  padding: 0;
}

.nav-link {
  display: inline-flex;
  align-items: center;
  font-size: 0.875rem;
  font-weight: var(--font-medium);
  color: var(--color-text-secondary);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  transition: color var(--transition-fast), background-color var(--transition-fast);
  text-decoration: none;
}

.nav-link:hover {
  color: var(--color-text-primary);
  background: var(--color-surface);
}

.nav-link:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.nav-link-active {
  color: var(--color-accent);
  background: var(--color-accent-soft);
}

/* CTAs do header */
.nav-login,
.nav-cta {
  font-size: 0.875rem;
  padding: var(--space-2) var(--space-4);
  height: auto;
  min-height: 0;
}

.nav-login {
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  margin-left: var(--space-3);
}

.nav-login:hover {
  background: var(--color-surface);
  color: var(--color-text-primary);
  border-color: var(--color-text-muted);
}

/* Theme toggle desktop */
.theme-toggle {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  color: var(--color-text-secondary);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: color var(--transition-fast), background-color var(--transition-fast), border-color var(--transition-fast);
}

.theme-toggle:hover {
  color: var(--color-text-primary);
  background: var(--color-surface);
  border-color: var(--color-text-muted);
}

.theme-toggle:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

/* ==========================================================================
   Mobile Trigger (apenas < 768px)
   ========================================================================== */

.menu-trigger {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: background-color var(--transition-fast), border-color var(--transition-fast);
  -webkit-tap-highlight-color: transparent;
}

.menu-trigger:hover,
.menu-trigger:focus-visible {
  background: var(--color-surface);
  border-color: var(--color-text-muted);
}

.menu-trigger:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

@media (min-width: 768px) {
  .menu-trigger {
    display: none;
  }
}

/* ==========================================================================
   Mobile Drawer
   ========================================================================== */

.drawer-root {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  justify-content: flex-end;
}

.drawer-scrim {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, #000 50%, transparent);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.drawer {
  position: relative;
  width: min(86vw, 360px);
  height: 100dvh;
  background: var(--color-background);
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-xl);
  outline: none;
  /* Safe area iOS notch */
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}

/* Halo sutil de identidade no topo */
.drawer::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 220px;
  background: radial-gradient(ellipse 80% 100% at 0% 0%, var(--color-primary-glow), transparent 70%);
  pointer-events: none;
  opacity: 0.7;
}

.drawer-head {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--color-border);
}

.drawer-brand {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-weight: var(--font-bold);
  color: var(--color-text-primary);
}

.drawer-close {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: background-color var(--transition-fast);
  -webkit-tap-highlight-color: transparent;
}

.drawer-close:hover {
  background: var(--color-surface);
}

/* Lista — alvos de toque grandes, hierarquia clara */
.drawer-nav {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: var(--space-4) var(--space-3);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.drawer-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: 56px;
  padding: 0 var(--space-4);
  border-radius: var(--radius-lg);
  font-size: 1.0625rem;
  font-weight: var(--font-medium);
  color: var(--color-text-primary);
  text-decoration: none;
  transition: background-color var(--transition-fast), color var(--transition-fast);
}

.drawer-link:hover,
.drawer-link:focus-visible {
  background: var(--color-surface);
  outline: none;
}

.drawer-link-arrow {
  color: var(--color-text-muted);
  transition: transform var(--transition-fast), color var(--transition-fast);
  flex-shrink: 0;
}

.drawer-link:hover .drawer-link-arrow {
  transform: translateX(2px);
  color: var(--color-text-secondary);
}

.drawer-link-active {
  background: var(--color-accent-soft);
  color: var(--color-accent);
}

.drawer-link-active .drawer-link-arrow {
  color: var(--color-accent);
}

/* Footer — actions de conversão */
.drawer-foot {
  padding: var(--space-4) var(--space-5) calc(var(--space-5) + env(safe-area-inset-bottom));
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.drawer-theme {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  color: var(--color-text-secondary);
  font-size: 0.8125rem;
  font-weight: var(--font-medium);
  cursor: pointer;
  transition: background-color var(--transition-fast), color var(--transition-fast);
  -webkit-tap-highlight-color: transparent;
}

.drawer-theme:hover {
  background: var(--color-background);
  color: var(--color-text-primary);
}

.drawer-actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.drawer-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 48px;
  padding: 0 var(--space-4);
  border-radius: var(--radius-lg);
  font-weight: var(--font-semibold);
  font-size: 0.9375rem;
  text-decoration: none;
  transition: background-color var(--transition-fast), transform 100ms ease, box-shadow var(--transition-fast);
  -webkit-tap-highlight-color: transparent;
}

.drawer-btn:active { transform: scale(0.98); }

.drawer-btn--ghost {
  background: var(--color-background);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.drawer-btn--ghost:hover {
  border-color: var(--color-accent-muted);
}

.drawer-btn--primary {
  background: var(--color-accent);
  color: var(--color-on-accent, #fff);
  box-shadow: 0 8px 20px -8px var(--color-primary-glow);
}

.drawer-btn--primary:hover {
  background: var(--color-accent-hover);
  box-shadow: 0 12px 28px -8px var(--color-primary-glow);
}

/* ==========================================================================
   Drawer Transition (slide + fade do scrim)
   ========================================================================== */

.drawer-enter-active .drawer,
.drawer-leave-active .drawer {
  transition: transform 280ms cubic-bezier(0.32, 0.72, 0, 1);
}

.drawer-enter-from .drawer,
.drawer-leave-to .drawer {
  transform: translateX(100%);
}

.drawer-enter-active .drawer-scrim,
.drawer-leave-active .drawer-scrim {
  transition: opacity 240ms ease;
}

.drawer-enter-from .drawer-scrim,
.drawer-leave-to .drawer-scrim {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .drawer-enter-active .drawer,
  .drawer-leave-active .drawer,
  .drawer-enter-active .drawer-scrim,
  .drawer-leave-active .drawer-scrim {
    transition: none;
  }
}
</style>
