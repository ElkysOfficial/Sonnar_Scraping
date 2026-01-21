<template>
  <section id="planos" class="section">
    <div class="container">
      <div class="section-header">
        <h2 class="section-title">Planos</h2>
        <p class="section-subtitle">
          Comece grátis. Evolua quando fizer sentido.
        </p>
      </div>

      <div class="pricing-grid">
        <article
          class="pricing-card"
          :class="{ 'pricing-featured': plan.featured }"
          v-for="(plan, index) in plans"
          :key="index"
        >
          <div class="pricing-header">
            <h3 class="pricing-name">{{ plan.name }}</h3>
            <p class="pricing-description">{{ plan.description }}</p>
          </div>

          <div class="pricing-price">
            <span class="price-currency">R$</span>
            <span class="price-value">{{ plan.price }}</span>
            <span class="price-period" v-if="plan.price !== '0'">/mês</span>
          </div>

          <ul class="pricing-features">
            <li v-for="(feature, fIndex) in plan.features" :key="fIndex">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 8L6.5 11.5L13 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span>{{ feature }}</span>
            </li>
          </ul>

          <a
            :href="plan.cta.href"
            class="btn pricing-cta"
            :class="plan.featured ? 'btn-primary' : 'btn-secondary'"
          >
            {{ plan.cta.text }}
          </a>

          <p class="pricing-note" v-if="plan.note">{{ plan.note }}</p>
        </article>
      </div>
    </div>
  </section>
</template>

<script>
export default {
  name: 'PricingSection',
  data() {
    return {
      plans: [
        {
          name: 'Comunidade',
          description: 'Acesso gratuito ao canal público de vagas.',
          price: '0',
          featured: false,
          features: [
            'Vagas do canal público',
            'Filtro por stack principal',
            'Vagas no Discord',
            'Atualizações diárias'
          ],
          cta: {
            text: 'Entrar no Discord',
            href: '#contato'
          },
          note: null
        },
        {
          name: 'Pro',
          description: 'Vagas no WhatsApp com filtros avançados.',
          price: '12',
          featured: true,
          features: [
            'Tudo do plano gratuito',
            'Vagas no WhatsApp',
            'Filtros avançados (senioridade, modelo, faixa)',
            'Vagas antes do canal público',
            'Suporte prioritário'
          ],
          cta: {
            text: 'Começar teste grátis',
            href: '#contato'
          },
          note: '7 dias grátis. Cancele quando quiser.'
        }
      ]
    }
  }
}
</script>

<style scoped>
/* ==========================================================================
   Pricing Grid — Mobile-First
   ========================================================================== */

.pricing-grid {
  display: grid;
  /* Mobile: single column */
  grid-template-columns: 1fr;
  gap: var(--space-6);
  /* Constrain width and center */
  max-width: min(50rem, 100%);
  margin: 0 auto;
}

/* Tablet+: 2 columns */
@media (min-width: 640px) {
  .pricing-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* ==========================================================================
   Pricing Card
   ========================================================================== */

.pricing-card {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: clamp(1.5rem, 4vw, 2rem);
  display: flex;
  flex-direction: column;
  transition: transform var(--transition-base), box-shadow var(--transition-base);
}

.pricing-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
}

/* Featured Card */
.pricing-featured {
  border-color: var(--color-accent);
  position: relative;
}

.pricing-featured::before {
  content: 'Recomendado';
  position: absolute;
  top: -0.75rem;
  left: 50%;
  transform: translateX(-50%);
  background: var(--color-accent);
  color: white;
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-full);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
}

/* ==========================================================================
   Pricing Header
   ========================================================================== */

.pricing-header {
  margin-bottom: var(--space-6);
}

.pricing-name {
  font-size: var(--text-xl);
  font-weight: var(--font-bold);
  color: var(--color-text-primary);
  margin-bottom: var(--space-1);
}

.pricing-description {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

/* ==========================================================================
   Pricing Price
   ========================================================================== */

.pricing-price {
  display: flex;
  align-items: baseline;
  gap: 0.125rem;
  margin-bottom: var(--space-6);
  padding-bottom: var(--space-6);
  border-bottom: 1px solid var(--color-border);
}

.price-currency {
  font-size: var(--text-lg);
  font-weight: var(--font-medium);
  color: var(--color-text-secondary);
}

.price-value {
  /* Fluid price size */
  font-size: clamp(2.5rem, 6vw, 3rem);
  font-weight: var(--font-bold);
  color: var(--color-text-primary);
  line-height: 1;
  letter-spacing: -0.02em;
}

.price-period {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin-left: var(--space-1);
}

/* ==========================================================================
   Pricing Features
   ========================================================================== */

.pricing-features {
  flex: 1;
  margin-bottom: var(--space-6);
}

.pricing-features li {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.pricing-features svg {
  flex-shrink: 0;
  color: var(--color-success);
  margin-top: 0.125rem;
}

/* ==========================================================================
   Pricing CTA
   ========================================================================== */

.pricing-cta {
  width: 100%;
  text-align: center;
  padding: var(--space-3) var(--space-4);
}

.pricing-note {
  margin-top: var(--space-3);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  text-align: center;
}

/* ==========================================================================
   Touch Device Optimizations
   ========================================================================== */

@media (hover: none) and (pointer: coarse) {
  .pricing-card:hover {
    transform: none;
    box-shadow: none;
  }
}
</style>
