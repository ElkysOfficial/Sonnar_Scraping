<template>
  <section id="beneficios" class="section benefits">
    <div class="container">
      <div class="section-header">
        <h2 class="section-title">Por que usar o Sonnar</h2>
        <p class="section-subtitle">
          Tecnologia a serviço da sua carreira. Economize tempo e encontre a vaga certa.
        </p>
      </div>

      <div class="benefits-grid">
        <article class="benefit-card" v-for="(benefit, index) in benefits" :key="index">
          <div class="benefit-icon" v-html="benefit.icon"></div>
          <h3 class="benefit-title">{{ benefit.title }}</h3>
          <p class="benefit-description">{{ benefit.description }}</p>
        </article>
      </div>
    </div>
  </section>
</template>

<script>
export default {
  name: 'BenefitsSection',
  data() {
    return {
      benefits: [
        {
          title: 'Precisão de stack',
          description: 'Filtros avançados por tecnologias, frameworks e linguagens. Receba apenas vagas que fazem sentido para seu perfil técnico.',
          icon: `<svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="16" stroke="var(--color-accent)" stroke-width="2"/>
            <path d="M20 12V20L26 26" stroke="var(--color-accent)" stroke-width="2" stroke-linecap="round"/>
            <circle cx="20" cy="20" r="3" fill="var(--color-accent)"/>
          </svg>`
        },
        {
          title: 'Acesso VIP',
          description: 'Assinantes VIP recebem vagas com prioridade, antes de serem publicadas nos canais públicos. Saia na frente.',
          icon: `<svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <path d="M20 8L24 16L33 17L26.5 23.5L28 32L20 28L12 32L13.5 23.5L7 17L16 16L20 8Z" stroke="var(--color-accent)" stroke-width="2" stroke-linejoin="round"/>
            <path d="M20 14L22 18L26 18.5L23 21.5L24 26L20 24L16 26L17 21.5L14 18.5L18 18L20 14Z" fill="var(--color-accent)"/>
          </svg>`
        },
        {
          title: 'Zero duplicatas',
          description: 'Algoritmo inteligente que identifica e elimina vagas repetidas de diferentes fontes. Seu tempo vale ouro.',
          icon: `<svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <rect x="8" y="12" width="16" height="20" rx="2" stroke="var(--color-accent)" stroke-width="2"/>
            <rect x="16" y="8" width="16" height="20" rx="2" stroke="var(--color-accent)" stroke-width="2" fill="var(--color-background)"/>
            <path d="M20 16L24 20L32 12" stroke="var(--color-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>`
        },
        {
          title: 'Ranking inteligente',
          description: 'Vagas ordenadas por relevância ao seu perfil. As melhores oportunidades sempre no topo.',
          icon: `<svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <rect x="8" y="24" width="6" height="8" rx="1" fill="var(--color-accent)" opacity="0.5"/>
            <rect x="17" y="18" width="6" height="14" rx="1" fill="var(--color-accent)" opacity="0.7"/>
            <rect x="26" y="10" width="6" height="22" rx="1" fill="var(--color-accent)"/>
            <path d="M29 6L31 10L27 10L29 6Z" fill="var(--color-accent)"/>
          </svg>`
        },
        {
          title: 'Alertas instantâneos',
          description: 'Notificações em tempo real no Discord ou WhatsApp. Candidate-se antes da concorrência.',
          icon: `<svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <path d="M20 8C14 8 10 12 10 18V24L8 28H32L30 24V18C30 12 26 8 20 8Z" stroke="var(--color-accent)" stroke-width="2"/>
            <path d="M16 28C16 30.2 17.8 32 20 32C22.2 32 24 30.2 24 28" stroke="var(--color-accent)" stroke-width="2"/>
            <circle cx="28" cy="12" r="4" fill="var(--color-accent)"/>
          </svg>`
        },
        {
          title: 'Suporte dedicado',
          description: 'Dúvidas sobre o bot ou suas configurações? Nossa equipe está sempre pronta para ajudar.',
          icon: `<svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="12" stroke="var(--color-accent)" stroke-width="2"/>
            <circle cx="20" cy="20" r="6" stroke="var(--color-accent)" stroke-width="2"/>
            <path d="M20 8V14M20 26V32M8 20H14M26 20H32" stroke="var(--color-accent)" stroke-width="2" stroke-linecap="round"/>
          </svg>`
        }
      ]
    }
  }
}
</script>

<style scoped>
/* ==========================================================================
   Benefits Section
   ========================================================================== */

.benefits {
  background: var(--color-background);
}

/* ==========================================================================
   Benefits Grid — Mobile-First with auto-fit
   ========================================================================== */

.benefits-grid {
  display: grid;
  /* Mobile: single column */
  grid-template-columns: 1fr;
  gap: var(--space-4);
}

/* Small screens: 2 columns */
@media (min-width: 480px) {
  .benefits-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-5);
  }
}

/* Desktop: 3 columns */
@media (min-width: 1024px) {
  .benefits-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-6);
  }
}

/* ==========================================================================
   Benefit Card
   ========================================================================== */

.benefit-card {
  background: var(--color-surface);
  border-radius: var(--radius-xl);
  padding: clamp(1.25rem, 4vw, 2rem);
  border: 1px solid var(--color-border);
  transition: all var(--transition-base);
}

.benefit-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-md);
  border-color: var(--color-primary-soft);
}

/* ==========================================================================
   Benefit Icon
   ========================================================================== */

.benefit-icon {
  width: clamp(3rem, 8vw, 4rem);
  height: clamp(3rem, 8vw, 4rem);
  background: var(--color-primary-soft);
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--space-5);
}

.benefit-icon :deep(svg) {
  width: clamp(1.5rem, 4vw, 2.5rem);
  height: clamp(1.5rem, 4vw, 2.5rem);
}

/* ==========================================================================
   Benefit Content
   ========================================================================== */

.benefit-title {
  font-size: var(--text-lg);
  font-weight: var(--font-bold);
  color: var(--color-text-primary);
  margin-bottom: var(--space-2);
}

.benefit-description {
  font-size: var(--text-base);
  color: var(--color-text-secondary);
  line-height: 1.7;
}

/* ==========================================================================
   Touch Device Optimizations
   ========================================================================== */

@media (hover: none) and (pointer: coarse) {
  .benefit-card:hover {
    transform: none;
    box-shadow: none;
    border-color: var(--color-border);
  }
}
</style>
