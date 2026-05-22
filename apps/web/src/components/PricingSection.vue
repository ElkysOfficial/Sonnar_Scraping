<template>
  <section
    id="planos"
    class="pricing-section section"
  >
    <div class="container">
      <div class="pricing-header">
        <h2 class="pricing-heading">Escolha o plano ideal</h2>
        <p class="pricing-sub">
          Invista na sua carreira pelo preço de um café. Sem fidelidade, cancele quando quiser.
        </p>
      </div>

      <div class="pricing-grid">
        <article
          v-for="plan in plans"
          :key="plan.tier"
          class="plan-card"
          :class="{ 'plan-card--featured': plan.featured }"
        >
          <div v-if="plan.badge" class="plan-pop-badge">{{ plan.badge }}</div>

          <header class="plan-head">
            <div class="plan-eyebrow" :class="{ 'plan-eyebrow--accent': plan.featured }">
              {{ plan.name }}
            </div>
            <div class="plan-price">
              <template v-if="plan.price === 0">Grátis</template>
              <template v-else>
                R$ {{ plan.price }}<span class="plan-price-period">/mês</span>
              </template>
            </div>
            <p class="plan-tagline">{{ plan.tagline }}</p>
            <p v-if="plan.trial" class="plan-trial">
              <span class="plan-trial__pulse" aria-hidden="true"></span>
              {{ plan.trial }}
            </p>
          </header>

          <div class="plan-features">
            <div
              v-for="(group, gi) in plan.featureGroups"
              :key="gi"
              class="plan-feature-group"
            >
              <p v-if="group.title" class="plan-feature-group__title">{{ group.title }}</p>
              <ul class="plan-feature-list">
                <li
                  v-for="(feature, fi) in group.items"
                  :key="fi"
                  :class="['plan-feature', `plan-feature--${feature.kind || 'on'}`]"
                >
                  <svg
                    v-if="feature.kind !== 'off'"
                    class="plan-feature-icon"
                    viewBox="0 0 18 18"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M5 9.5L8 12L13 6.5"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                  <svg
                    v-else
                    class="plan-feature-icon"
                    viewBox="0 0 18 18"
                    fill="none"
                    aria-hidden="true"
                  >
                    <line
                      x1="5"
                      y1="9"
                      x2="13"
                      y2="9"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                    />
                  </svg>
                  <span>
                    <strong v-if="feature.highlight">{{ feature.highlight }}</strong>
                    <template v-if="feature.highlight"> </template>
                    {{ feature.label }}
                    <span v-if="feature.kind === 'soon'" class="plan-feature-soon">Em breve</span>
                  </span>
                </li>
              </ul>
            </div>
          </div>

          <router-link
            :to="`/cadastro/${plan.tier}`"
            class="plan-cta"
            :class="plan.featured ? 'plan-cta--primary' : 'plan-cta--ghost'"
          >
            {{ plan.ctaLabel }}
          </router-link>
        </article>
      </div>
    </div>
  </section>
</template>

<script>
const plans = [
  {
    tier: 'free',
    name: 'Comunidade',
    price: 0,
    tagline: 'Para acompanhar o ecossistema e trocar ideia com outros devs.',
    ctaLabel: 'Entrar grátis',
    featureGroups: [
      {
        title: 'Comunidade',
        items: [
          { label: 'Acesso ao Discord, WhatsApp e Telegram' },
          { label: 'Vagas compartilhadas pela comunidade' },
          { label: 'Networking com outros devs' }
        ]
      },
      {
        title: 'Não inclui',
        items: [
          { label: 'Canal exclusivo de vagas', kind: 'off' },
          { label: 'Filtros automáticos por stack', kind: 'off' },
          { label: 'Match score por vaga', kind: 'off' }
        ]
      }
    ]
  },
  {
    tier: 'plus',
    name: 'Plus',
    price: 10,
    tagline: 'A IA seleciona vagas alinhadas ao seu perfil. Para quem busca direcionamento.',
    ctaLabel: 'Começar 7 dias grátis',
    badge: 'Mais Popular',
    featured: true,
    trial: '7 dias grátis · cancele quando quiser',
    featureGroups: [
      {
        title: 'Tudo do Pro',
        items: [
          { label: 'Tudo que está no plano Pro' }
        ]
      },
      {
        title: 'IA + Curadoria',
        items: [
          { highlight: 'IA analisa', label: 'cada vaga e calcula match com seu perfil' },
          { highlight: 'Match score 0–100', label: 'em toda vaga recebida' },
          { highlight: 'Tempo real', label: '- vagas chegam antes do canal Pro' },
          { highlight: 'Curadoria humana:', label: 'top 10 vagas semanais selecionadas', kind: 'soon' },
          { highlight: 'Relatório semanal', label: 'do mercado por stack e senioridade', kind: 'soon' },
          { label: 'Suporte prioritário no WhatsApp' }
        ]
      }
    ]
  },
  {
    tier: 'pro',
    name: 'Pro',
    price: 5,
    tagline: 'Todas as vagas de TI no seu canal exclusivo do WhatsApp.',
    ctaLabel: 'Começar 7 dias grátis',
    trial: '7 dias grátis · cancele quando quiser',
    featureGroups: [
      {
        title: 'Vagas',
        items: [
          { highlight: 'Canal exclusivo no WhatsApp', label: '(separado da comunidade)' },
          { highlight: 'Todas as vagas de TI', label: 'coletadas das principais plataformas' },
          { label: 'Sem duplicatas, sem ruído' }
        ]
      },
      {
        title: 'Não inclui',
        items: [
          { label: 'Filtro das vagas pelo seu perfil (Plus)', kind: 'off' },
          { label: 'Match score por IA (Plus)', kind: 'off' }
        ]
      }
    ]
  }
]

export default {
  name: 'PricingSection',
  data() {
    return { plans }
  }
}
</script>

<style scoped>
.pricing-section {
  background: var(--color-background);
  color: var(--color-text-primary);
  padding: clamp(3rem, 6vw, 5rem) 0;
}

.pricing-header {
  text-align: center;
  max-width: 640px;
  margin: 0 auto 48px;
  padding: 0 24px;
}

.pricing-heading {
  font-size: clamp(2rem, 4vw, 3rem);
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.02em;
  color: var(--color-text-primary);
  margin: 0 0 16px;
}

.pricing-sub {
  font-size: 1.125rem;
  line-height: 1.6;
  color: var(--color-text-secondary);
  margin: 0;
}

.pricing-grid {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 24px;
  align-items: stretch;
}

@media (min-width: 768px) {
  .pricing-grid { grid-template-columns: repeat(3, 1fr); }
}

/* ==========================================================================
   Card base
   ========================================================================== */
.plan-card {
  position: relative;
  background: var(--color-glass-bg);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--color-glass-border);
  border-radius: 24px;
  padding: 32px 28px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  box-shadow: var(--shadow-lg);
  transition: transform 200ms ease, border-color 200ms ease, box-shadow 200ms ease;
}

.plan-card:hover {
  transform: translateY(-4px);
  border-color: var(--color-accent-muted);
}

.plan-card--featured {
  border-color: var(--color-accent);
  box-shadow:
    var(--shadow-xl),
    0 0 0 1px var(--color-accent) inset,
    0 25px 50px -12px var(--color-primary-glow);
}

@media (min-width: 768px) {
  .plan-card--featured { transform: scale(1.04); }
  .plan-card--featured:hover { transform: scale(1.04) translateY(-4px); }
}

.plan-pop-badge {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--color-accent);
  color: var(--color-on-accent);
  padding: 6px 16px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  white-space: nowrap;
  box-shadow: 0 8px 20px -8px var(--color-primary-glow);
}

/* ==========================================================================
   Head
   ========================================================================== */
.plan-head {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.plan-eyebrow {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-text-secondary);
  line-height: 1;
}
.plan-eyebrow--accent { color: var(--color-accent); }

.plan-price {
  font-size: clamp(2rem, 3.5vw, 2.75rem);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: var(--color-text-primary);
}

.plan-price-period {
  font-size: 1rem;
  font-weight: 400;
  color: var(--color-text-secondary);
  margin-left: 4px;
}

.plan-tagline {
  font-size: 0.9375rem;
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin: 0;
}

.plan-trial {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--color-accent-soft);
  color: var(--color-accent);
  font-size: 0.75rem;
  font-weight: 600;
  align-self: flex-start;
}
.plan-trial__pulse {
  width: 6px;
  height: 6px;
  background: var(--color-accent);
  border-radius: 999px;
  box-shadow: 0 0 0 0 var(--color-accent);
  animation: trial-pulse 2s ease-in-out infinite;
}
@keyframes trial-pulse {
  0%, 100% { box-shadow: 0 0 0 0 var(--color-accent); opacity: 1; }
  50%      { box-shadow: 0 0 0 5px transparent; opacity: 0.6; }
}

/* ==========================================================================
   Features groups
   ========================================================================== */
.plan-features {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
}

.plan-feature-group__title {
  margin: 0 0 8px;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.plan-feature-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.plan-feature {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 0.9375rem;
  line-height: 1.45;
  color: var(--color-text-primary);
}

.plan-feature--on .plan-feature-icon { color: var(--color-accent); }
.plan-feature--off {
  color: var(--color-text-muted);
  text-decoration: line-through;
  text-decoration-color: color-mix(in srgb, var(--color-text-muted) 50%, transparent);
  text-decoration-thickness: 1px;
}
.plan-feature--off .plan-feature-icon { color: var(--color-text-muted); opacity: 0.7; }
.plan-feature--soon { color: var(--color-text-secondary); }
.plan-feature--soon .plan-feature-icon { color: var(--color-text-muted); }

.plan-feature-soon {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--color-accent-soft);
  color: var(--color-accent);
  font-size: 0.6875rem;
  font-weight: 700;
  vertical-align: middle;
  white-space: nowrap;
}

.plan-feature-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  margin-top: 1px;
}

.plan-feature strong {
  font-weight: 600;
  color: var(--color-text-primary);
}

/* ==========================================================================
   CTA
   ========================================================================== */
.plan-cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 14px 16px;
  border-radius: 12px;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
  font-size: 0.9375rem;
  transition: background-color 200ms ease, transform 100ms ease, box-shadow 200ms ease, border-color 200ms ease;
}
.plan-cta:active { transform: scale(0.97); }

.plan-cta--ghost {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
}
.plan-cta--ghost:hover {
  background: var(--color-glass-bg);
  border-color: var(--color-accent-muted);
}

.plan-cta--primary {
  background: var(--color-accent);
  color: var(--color-on-accent);
  border: none;
  box-shadow: 0 10px 25px -8px var(--color-primary-glow);
}
.plan-cta--primary:hover {
  background: var(--color-accent-hover);
  box-shadow: 0 14px 32px -8px var(--color-primary-glow);
}
</style>
