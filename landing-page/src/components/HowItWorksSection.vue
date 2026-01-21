<template>
  <section id="como-funciona" class="section section-alt">
    <div class="container">
      <div class="section-header">
        <h2 class="section-title">Como funciona</h2>
        <p class="section-subtitle">
          Três passos para parar de caçar vaga.
        </p>
      </div>

      <div class="steps">
        <div class="step" v-for="(step, index) in steps" :key="index">
          <div class="step-number">{{ String(index + 1).padStart(2, '0') }}</div>
          <h3 class="step-title">{{ step.title }}</h3>
          <p class="step-description">{{ step.description }}</p>
        </div>
      </div>

      <div class="sources">
        <p class="sources-label">De onde vêm as vagas</p>
        <p class="sources-list">
          LinkedIn Jobs · Gupy · Glassdoor · Indeed · Programathor · Trampos.co ·
          GeekHunter · Remotar · Impulso · Revelo · Vagas.com · InfoJobs · Catho · + outras
        </p>
        <p class="sources-note">Fontes atualizadas regularmente. Última adição: Janeiro 2025.</p>
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
   Steps Grid — Mobile-First
   ========================================================================== */

.steps {
  display: grid;
  /* Mobile: single column */
  grid-template-columns: 1fr;
  gap: var(--space-3);
  margin-bottom: clamp(2.5rem, 6vw, 4rem);
}

/* Tablet: 2 columns (last one centered if odd) */
@media (min-width: 640px) {
  .steps {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-4);
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
  padding: clamp(1.25rem, 4vw, 2rem);
  background: var(--color-background);
  border-radius: var(--radius-lg);
  border: 1px solid transparent;
  transition: all var(--transition-base);
}

.step:hover {
  border-color: var(--color-border);
  box-shadow: var(--shadow-md);
}

.step:hover .step-number {
  color: var(--color-accent);
}

.step-number {
  /* Fluid font size */
  font-size: clamp(2rem, 5vw, 3rem);
  font-weight: var(--font-bold);
  color: var(--color-border);
  line-height: 1;
  margin-bottom: var(--space-4);
  letter-spacing: -0.02em;
  transition: color var(--transition-base);
}

.step-title {
  font-size: var(--text-lg);
  font-weight: var(--font-bold);
  color: var(--color-text-primary);
  margin-bottom: var(--space-2);
}

.step-description {
  font-size: var(--text-base);
  color: var(--color-text-secondary);
  line-height: 1.6;
}

/* ==========================================================================
   Sources Section
   ========================================================================== */

.sources {
  text-align: center;
  padding: clamp(1.5rem, 5vw, 3rem);
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.sources-label {
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--space-4);
}

.sources-list {
  font-size: var(--text-base);
  color: var(--color-text-secondary);
  line-height: 1.8;
  max-width: 40rem;
  margin: 0 auto var(--space-4);
}

.sources-note {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
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
    color: var(--color-border);
  }
}
</style>
