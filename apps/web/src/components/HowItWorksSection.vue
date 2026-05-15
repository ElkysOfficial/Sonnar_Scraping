<template>
  <section
    id="como-funciona"
    class="section section-alt"
  >
    <div class="container">
      <div class="section-header">
        <h2 class="section-title">
          Como funciona
        </h2>
        <p class="section-subtitle">
          Três passos para parar de caçar vaga.
        </p>
      </div>

      <div class="steps">
        <div
          v-for="(step, index) in steps"
          :key="index"
          class="step"
        >
          <div class="step-icon" aria-hidden="true">
            <!-- 1. Configure stack: pilha de tecnologias com sonar emanando do topo -->
            <svg v-if="index === 0" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <!-- Layers -->
              <rect x="10" y="28" width="28" height="6" rx="1.5" />
              <rect x="13" y="34" width="22" height="5" rx="1.2" opacity="0.65" />
              <rect x="16" y="39" width="16" height="3.5" rx="1" opacity="0.4" />
              <!-- Sonar arc emerging from stack -->
              <circle cx="24" cy="28" r="2.5" fill="currentColor" stroke="none" />
              <path d="M16 22 a8 8 0 0 1 16 0" />
              <path d="M12 22 a12 12 0 0 1 24 0" opacity="0.6" />
              <path d="M8  22 a16 16 0 0 1 32 0" opacity="0.3" />
            </svg>
            <!-- 2. Conecte canal: balão de chat com pulso de sinal -->
            <svg v-else-if="index === 1" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <!-- Chat bubble -->
              <path d="M10 14 h22 a4 4 0 0 1 4 4 v10 a4 4 0 0 1 -4 4 h-12 l-6 5 v-5 h-4 a4 4 0 0 1 -4 -4 v-10 a4 4 0 0 1 4 -4 z" />
              <!-- Antenna + radio waves -->
              <line x1="38" y1="8" x2="38" y2="14" />
              <circle cx="38" cy="8" r="1.4" fill="currentColor" stroke="none" />
              <path d="M34 10 a6 6 0 0 1 8 0" opacity="0.7" />
              <path d="M31 8  a10 10 0 0 1 14 0" opacity="0.4" />
            </svg>
            <!-- 3. Receba vagas: radar com dot detectado (match) -->
            <svg v-else viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <!-- Concentric radar -->
              <circle cx="24" cy="24" r="16" />
              <circle cx="24" cy="24" r="11" opacity="0.6" />
              <circle cx="24" cy="24" r="6" opacity="0.35" />
              <!-- Sweep line -->
              <line x1="24" y1="24" x2="36" y2="14" />
              <!-- Detected blip -->
              <circle cx="33" cy="17" r="2.5" fill="currentColor" stroke="none" />
              <circle cx="33" cy="17" r="5" opacity="0.4" />
            </svg>
          </div>
          <div class="step-number">
            {{ String(index + 1).padStart(2, '0') }}
          </div>
          <h3 class="step-title">
            {{ step.title }}
          </h3>
          <p class="step-description">
            {{ step.description }}
          </p>
        </div>
      </div>
    </div>
  </section>
</template>

<script>
export default {
  name: 'HowItWorksSection',
  data() {
    return {
      steps: [
        {
          title: 'Configure seu stack',
          description: 'Selecione linguagens, frameworks, senioridade e modelo de trabalho. Leva menos de 2 minutos.'
        },
        {
          title: 'Conecte seu canal',
          description: 'Escolha receber no WhatsApp ou no Discord. Você decide a frequência e os horários.'
        },
        {
          title: 'Receba vagas filtradas',
          description: 'Monitoramos 16+ fontes, removemos duplicatas e enviamos só o que combina com seu perfil.'
        }
      ]
    }
  }
}
</script>

<style scoped>
/* ==========================================================================
   Steps Grid - Mobile-First
   ========================================================================== */

.steps {
  display: grid;
  /* Mobile: single column */
  grid-template-columns: 1fr;
  gap: var(--grid-gap-sm);
}

/* Tablet: 2 columns (last one centered if odd) */
@media (min-width: 768px) {
  .steps {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--grid-gap);
  }

  /* Center the last item when odd number */
  .step:last-child:nth-child(odd) {
    grid-column: 1 / -1;
    max-width: 50%;
    justify-self: center;
  }
}

/* Desktop: 3 columns */
@media (min-width: 1024px) {
  .steps {
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-6);
  }

  .step:last-child:nth-child(odd) {
    max-width: 100%;
    grid-column: auto;
    justify-self: auto;
  }
}

/* ==========================================================================
   Step Card
   ========================================================================== */

.step {
  padding: var(--card-padding);
  background: var(--color-background);
  border-radius: var(--radius-card);
  border: 1px solid var(--color-border);
  transition: border-color var(--transition-base), box-shadow var(--transition-base), transform var(--transition-base);
  position: relative;
}

.step:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--color-accent-muted);
  transform: translateY(-2px);
}

.step:hover .step-icon {
  color: var(--color-accent);
}

.step:hover .step-number {
  color: var(--color-accent);
}

/* Ícone Sonnar - radar/sinal/stack */
.step-icon {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  margin-bottom: var(--space-4);
  border-radius: var(--radius-lg);
  background: var(--color-accent-soft);
  color: var(--color-accent);
  transition: color var(--transition-base), background-color var(--transition-base);
}

.step-icon svg {
  width: 32px;
  height: 32px;
}

.step-number {
  /* Fluid font size, agora secundário ao ícone */
  font-size: 0.75rem;
  font-weight: var(--font-bold);
  color: var(--color-text-muted);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  line-height: 1;
  margin-bottom: var(--space-2);
  transition: color var(--transition-base);
}

.step-number::before {
  content: 'Passo ';
}

.step-title {
  font-size: var(--text-lg);
  font-weight: var(--font-bold);
  color: var(--color-text-primary);
  margin-bottom: var(--space-2);
  line-height: var(--lh-title);
}

.step-description {
  font-size: var(--text-base);
  color: var(--color-text-secondary);
  line-height: var(--lh-body);
}

/* ==========================================================================
   Touch Device Optimizations
   ========================================================================== */

@media (hover: none) and (pointer: coarse) {
  .step:hover {
    border-color: transparent;
    box-shadow: none;
  }

  .step:hover .step-number {
    color: var(--color-text-muted);
  }
}
</style>
