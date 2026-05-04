<!-- DashboardFooter.vue - Kept but not used in dashboards. Available for future use if needed. -->
<template>
  <footer class="dashboard-footer">
    <div class="footer-content">
      <div class="footer-brand">
        <router-link to="/" class="footer-logo">
          <span class="logo-mark">S</span>
          <span class="logo-text">Sonnar</span>
        </router-link>
      </div>

      <div class="footer-links">
        <a href="#">Termos</a>
        <a href="#">Privacidade</a>
      </div>

      <p class="footer-copyright">
        © {{ currentYear }} Sonnar
      </p>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const currentYear = computed(() => new Date().getFullYear())
</script>

<style scoped>
.dashboard-footer {
  background: var(--color-background);
  border-top: 1px solid var(--color-border);
  padding: var(--space-4) 0;
  margin-top: auto;
  flex-shrink: 0;
}

.footer-content {
  max-width: var(--container-max);
  margin: 0 auto;
  padding: 0 var(--container-padding);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.footer-logo {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-primary);
}

.logo-mark {
  width: 1.5rem;
  height: 1.5rem;
  background: var(--color-accent);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: var(--font-bold);
  font-size: var(--text-xs);
}

.logo-text {
  font-size: var(--text-sm);
  font-weight: var(--font-bold);
}

.footer-links {
  display: flex;
  gap: var(--space-4);
}

.footer-links a {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  text-decoration: underline;
  transition: color var(--transition-fast);
}

.footer-links a:hover {
  color: var(--color-text-primary);
}

.footer-copyright {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

@media (max-width: 640px) {
  .footer-content {
    flex-direction: column;
    text-align: center;
    gap: var(--space-3);
  }
}
</style>
