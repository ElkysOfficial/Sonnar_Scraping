<template>
  <header class="header" :class="{ 'header-scrolled': isScrolled }">
    <div class="container header-content">
      <a href="#" class="logo" aria-label="Sonnar - Início">
        <span class="logo-mark">S</span>
        <span class="logo-text">Sonnar</span>
      </a>

      <nav class="nav" :class="{ 'nav-open': isMenuOpen }" aria-label="Navegação principal">
        <ul class="nav-list">
          <li v-for="link in navLinks" :key="link.href">
            <a
              :href="link.href"
              class="nav-link"
              :class="{ 'nav-link-active': activeSection === link.href.slice(1) }"
              @click="closeMenu"
            >
              {{ link.label }}
            </a>
          </li>
        </ul>
        <a href="#contato" class="btn btn-primary nav-cta" @click="closeMenu">
          Começar
        </a>

        <!-- Theme Toggle -->
        <button
          class="theme-toggle"
          @click="toggleTheme"
          :aria-label="isDark ? 'Ativar modo claro' : 'Ativar modo escuro'"
          :title="isDark ? 'Modo claro' : 'Modo escuro'"
        >
          <!-- Sun Icon (visible in dark mode) -->
          <svg v-if="isDark" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="10" cy="10" r="4" stroke="currentColor" stroke-width="1.5"/>
            <path d="M10 2V4M10 16V18M18 10H16M4 10H2M15.657 4.343L14.243 5.757M5.757 14.243L4.343 15.657M15.657 15.657L14.243 14.243M5.757 5.757L4.343 4.343" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <!-- Moon Icon (visible in light mode) -->
          <svg v-else width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </nav>

      <button
        class="menu-toggle"
        @click="toggleMenu"
        :aria-expanded="isMenuOpen"
        aria-controls="main-nav"
        aria-label="Menu de navegação"
      >
        <span class="menu-bar" :class="{ 'menu-bar-open': isMenuOpen }"></span>
        <span class="menu-bar" :class="{ 'menu-bar-open': isMenuOpen }"></span>
        <span class="menu-bar" :class="{ 'menu-bar-open': isMenuOpen }"></span>
      </button>
    </div>
  </header>
</template>

<script>
export default {
  name: 'AppHeader',
  data() {
    return {
      isScrolled: false,
      isMenuOpen: false,
      activeSection: '',
      isDark: false,
      navLinks: [
        { href: '#como-funciona', label: 'Como funciona' },
        { href: '#planos', label: 'Planos' },
        { href: '#faq', label: 'FAQ' }
      ]
    }
  },
  mounted() {
    window.addEventListener('scroll', this.handleScroll)
    this.setupIntersectionObserver()
    this.initTheme()
  },
  beforeUnmount() {
    window.removeEventListener('scroll', this.handleScroll)
  },
  methods: {
    handleScroll() {
      this.isScrolled = window.scrollY > 50
    },
    toggleMenu() {
      this.isMenuOpen = !this.isMenuOpen
      document.body.style.overflow = this.isMenuOpen ? 'hidden' : ''
    },
    closeMenu() {
      this.isMenuOpen = false
      document.body.style.overflow = ''
    },
    setupIntersectionObserver() {
      const sections = document.querySelectorAll('section[id]')
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              this.activeSection = entry.target.id
            }
          })
        },
        { threshold: 0.3, rootMargin: '-80px 0px -50% 0px' }
      )
      sections.forEach((section) => observer.observe(section))
    },
    initTheme() {
      // Check for saved theme preference, or use system preference
      const savedTheme = localStorage.getItem('sonnar-theme')

      if (savedTheme) {
        this.isDark = savedTheme === 'dark'
        document.documentElement.setAttribute('data-theme', savedTheme)
      } else {
        // Check system preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        this.isDark = prefersDark
        // Don't set attribute - let CSS handle system preference
      }

      // Listen for system preference changes
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem('sonnar-theme')) {
          this.isDark = e.matches
        }
      })
    },
    toggleTheme() {
      this.isDark = !this.isDark
      const theme = this.isDark ? 'dark' : 'light'
      document.documentElement.setAttribute('data-theme', theme)
      localStorage.setItem('sonnar-theme', theme)
    }
  }
}
</script>

<style scoped>
/* ==========================================================================
   Header — Fixed Navigation
   ========================================================================== */

.header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: var(--z-fixed);
  background: var(--header-bg);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: all var(--transition-base), background-color 0.3s ease;
  border-bottom: 1px solid transparent;
}

.header-scrolled {
  background: var(--header-bg-scrolled);
  border-bottom-color: var(--color-border);
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* Fluid height */
  height: clamp(3.25rem, 8vh, 4rem);
}

/* ==========================================================================
   Logo
   ========================================================================== */

.logo {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-primary);
  transition: opacity var(--transition-fast);
  /* Ensure logo is above mobile nav */
  position: relative;
  z-index: 10;
}

.logo:hover {
  opacity: 0.8;
}

.logo-mark {
  width: clamp(1.75rem, 4vw, 2rem);
  height: clamp(1.75rem, 4vw, 2rem);
  background: var(--color-accent);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: var(--font-bold);
  font-size: clamp(0.875rem, 2vw, 1rem);
}

.logo-text {
  font-size: clamp(1rem, 2.5vw, 1.125rem);
  font-weight: var(--font-bold);
  letter-spacing: -0.01em;
}

/* ==========================================================================
   Desktop Navigation
   ========================================================================== */

.nav {
  display: flex;
  align-items: center;
  gap: var(--space-8);
}

.nav-list {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.nav-link {
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--color-text-secondary);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
}

.nav-link:hover {
  color: var(--color-text-primary);
  background: var(--color-surface);
}

.nav-link-active {
  color: var(--color-accent);
}

.nav-cta {
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-sm);
}

/* ==========================================================================
   Theme Toggle
   ========================================================================== */

.theme-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  padding: 0;
  color: var(--color-text-secondary);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  -webkit-tap-highlight-color: transparent;
}

.theme-toggle:hover {
  color: var(--color-text-primary);
  background: var(--color-surface);
  border-color: var(--color-text-muted);
}

.theme-toggle svg {
  width: 1.125rem;
  height: 1.125rem;
  transition: transform 0.3s ease;
}

.theme-toggle:hover svg {
  transform: rotate(15deg);
}

/* ==========================================================================
   Mobile Menu Toggle — 44px Touch Target
   ========================================================================== */

.menu-toggle {
  display: none;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  /* Minimum 44px touch target */
  width: 2.75rem;
  height: 2.75rem;
  padding: var(--space-2);
  border-radius: var(--radius-md);
  transition: background var(--transition-fast);
  /* Ensure toggle is above mobile nav */
  position: relative;
  z-index: 10;
  -webkit-tap-highlight-color: transparent;
}

.menu-toggle:hover {
  background: var(--color-surface);
}

.menu-bar {
  display: block;
  width: 1.25rem;
  height: 2px;
  background: var(--color-text-primary);
  border-radius: 2px;
  transition: all var(--transition-fast);
  transform-origin: center;
}

/* Hamburger to X animation */
.menu-bar-open:nth-child(1) {
  transform: rotate(45deg) translate(5px, 5px);
}

.menu-bar-open:nth-child(2) {
  opacity: 0;
}

.menu-bar-open:nth-child(3) {
  transform: rotate(-45deg) translate(5px, -5px);
}

/* ==========================================================================
   Mobile Navigation
   ========================================================================== */

@media (max-width: 768px) {
  .menu-toggle {
    display: flex;
  }

  .nav {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: var(--space-6);
    background: var(--color-background);
    transform: translateX(100%);
    transition: transform var(--transition-slow);
    gap: var(--space-6);
    z-index: 5;
  }

  .nav-open {
    transform: translateX(0);
  }

  .nav-list {
    flex-direction: column;
    gap: var(--space-2);
    width: 100%;
    max-width: 20rem;
  }

  .nav-list li {
    width: 100%;
  }

  .nav-link {
    display: block;
    /* Minimum 48px touch target */
    min-height: 3rem;
    padding: var(--space-3) var(--space-4);
    font-size: var(--text-lg);
    text-align: center;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .nav-cta {
    width: 100%;
    max-width: 20rem;
    padding: var(--space-4);
    font-size: var(--text-base);
    text-align: center;
    justify-content: center;
  }

  .theme-toggle {
    width: 2.75rem;
    height: 2.75rem;
    margin-top: var(--space-4);
  }
}

/* ==========================================================================
   Reduced Motion Support
   ========================================================================== */

@media (prefers-reduced-motion: reduce) {
  .nav {
    transition: none;
  }

  .menu-bar {
    transition: none;
  }
}
</style>
