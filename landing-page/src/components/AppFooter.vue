<template>
  <footer class="footer">
    <div class="container">
      <div class="footer-main">
        <div class="footer-brand">
          <a
            href="#"
            class="footer-logo"
            aria-label="Sonnar - Início"
          >
            <span class="logo-mark">S</span>
            <span class="logo-text">Sonnar</span>
          </a>
          <p class="footer-tagline">
            Vagas do seu stack, direto no WhatsApp.
          </p>
        </div>

        <nav
          class="footer-nav"
          aria-label="Links do rodapé"
        >
          <a href="#como-funciona">Como funciona</a>
          <a href="#planos">Planos</a>
          <a href="#faq">FAQ</a>
        </nav>

        <div class="footer-legal">
          <router-link to="/termos">Termos de Uso</router-link>
          <router-link to="/privacidade">Privacidade</router-link>
          <router-link to="/cookies">Cookies</router-link>
        </div>
      </div>

      <div class="footer-bottom">
        <p class="footer-copyright">
          © {{ currentYear }} Sonnar — Todos os direitos reservados a
          <a
            href="https://elkys.com.br"
            target="_blank"
            rel="noopener noreferrer"
            class="footer-elkys"
          >Elkys</a>.
        </p>
      </div>
    </div>
  </footer>
</template>

<script>
export default {
  name: 'AppFooter',
  computed: {
    currentYear() {
      return new Date().getFullYear()
    }
  }
}
</script>

<style scoped>
/* ==========================================================================
   Footer
   ========================================================================== */

.footer {
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
  padding: clamp(2.5rem, 6vw, 3rem) 0 var(--space-6);
  /* Prevenir CLS reservando altura mínima */
  min-height: 180px;
  contain: layout style;
}

/* ==========================================================================
   Footer Main — Responsive Layout
   ========================================================================== */

.footer-main {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  margin-bottom: var(--space-8);
}

/* Desktop: horizontal layout */
@media (min-width: 768px) {
  .footer-main {
    flex-direction: row;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-12);
  }
}

/* ==========================================================================
   Footer Brand
   ========================================================================== */

.footer-logo {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-primary);
  margin-bottom: var(--space-2);
}

.logo-mark {
  width: 1.75rem;
  height: 1.75rem;
  background: var(--color-accent);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: var(--font-bold);
  font-size: var(--text-sm);
}

.logo-text {
  font-size: var(--text-base);
  font-weight: var(--font-bold);
}

.footer-tagline {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

/* ==========================================================================
   Footer Navigation
   ========================================================================== */

.footer-nav {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4) var(--space-6);
}

.footer-nav a {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  transition: color var(--transition-fast);
  /* Minimum touch target */
  padding: var(--space-1) 0;
}

.footer-nav a:hover {
  color: var(--color-text-primary);
}

/* ==========================================================================
   Footer Legal
   ========================================================================== */

.footer-legal {
  display: flex;
  gap: var(--space-4);
}

.footer-legal a {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  text-decoration: underline;
  transition: color var(--transition-fast);
  /* Minimum touch target */
  padding: var(--space-1) 0;
}

.footer-legal a:hover {
  color: var(--color-text-primary);
}

/* ==========================================================================
   Footer Bottom
   ========================================================================== */

.footer-bottom {
  padding-top: var(--space-6);
  border-top: 1px solid var(--color-border);
}

.footer-copyright {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.footer-elkys {
  color: var(--color-accent);
  font-weight: var(--font-semibold);
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-color var(--transition-fast), color var(--transition-fast);
}
.footer-elkys:hover {
  border-bottom-color: var(--color-accent);
  color: var(--color-accent-hover);
}

/* Mobile: center everything */
@media (max-width: 767px) {
  .footer-main {
    text-align: center;
    align-items: center;
  }

  .footer-brand {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .footer-nav {
    justify-content: center;
  }

  .footer-legal {
    justify-content: center;
  }

  .footer-bottom {
    text-align: center;
  }
}
</style>
