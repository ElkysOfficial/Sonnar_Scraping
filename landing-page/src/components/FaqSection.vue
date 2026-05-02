<template>
  <section
    id="faq"
    class="section section-alt"
  >
    <div class="container">
      <div class="section-header">
        <h2 class="section-title">
          Perguntas frequentes
        </h2>
      </div>

      <div class="faq-list">
        <div
          v-for="(item, index) in faqs"
          :key="index"
          class="faq-item"
          :class="{ 'faq-item-open': openIndex === index }"
        >
          <button
            class="faq-question"
            :aria-expanded="openIndex === index"
            :aria-controls="`faq-answer-${index}`"
            @click="toggle(index)"
          >
            <span>{{ item.question }}</span>
            <svg
              class="faq-icon"
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M5 8L10 13L15 8"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <div
            :id="`faq-answer-${index}`"
            class="faq-answer"
            :style="{ maxHeight: openIndex === index ? '300px' : '0' }"
          >
            <p>{{ item.answer }}</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script>
export default {
  name: 'FaqSection',
  data() {
    return {
      openIndex: 0,
      faqs: [
        {
          question: 'Como o Sonnar encontra as vagas?',
          answer: 'Monitoramos mais de 16 fontes públicas de vagas, incluindo LinkedIn, Gupy, Glassdoor e portais especializados em tech. O sistema coleta, processa e deduplica automaticamente.'
        },
        {
          question: 'Preciso pagar para usar?',
          answer: 'Não. O plano Comunidade é gratuito. O Pro custa R$ 5/mês e o Plus R$ 10/mês, com 7 dias de teste nos planos pagos.'
        },
        {
          question: 'Posso escolher quais vagas receber?',
          answer: 'Sim. Você configura stack, senioridade, modelo de trabalho (remoto, híbrido, presencial) e faixa salarial. Só enviamos o que passa nos seus filtros.'
        },
        {
          question: 'Com que frequência recebo vagas?',
          answer: 'Depende do seu stack e filtros. Em média, usuários recebem entre 5 e 15 vagas relevantes por dia. Você pode ajustar para receber resumos diários ou em tempo real.'
        },
        {
          question: 'Como cancelo a assinatura?',
          answer: 'Direto pelo WhatsApp ou Discord, a qualquer momento. Sem burocracia, sem multa. O acesso continua até o fim do período pago.'
        }
      ]
    }
  },
  methods: {
    toggle(index) {
      this.openIndex = this.openIndex === index ? null : index
    }
  }
}
</script>

<style scoped>
/* ==========================================================================
   FAQ List — Centered with max-width
   ========================================================================== */

.faq-list {
  max-width: min(42.5rem, 100%);
  margin: 0 auto;
}

/* ==========================================================================
   FAQ Item
   ========================================================================== */

.faq-item {
  border-bottom: 1px solid var(--color-border);
}

.faq-item:last-child {
  border-bottom: none;
}

/* ==========================================================================
   FAQ Question Button — Accessible Touch Target
   ========================================================================== */

.faq-question {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  /* Minimum 48px touch target */
  min-height: 3rem;
  padding: var(--space-4) 0;
  font-size: var(--text-base);
  font-weight: var(--font-medium);
  color: var(--color-text-primary);
  text-align: left;
  transition: color var(--transition-fast);
  /* Improve tap response */
  -webkit-tap-highlight-color: transparent;
}

.faq-question:hover {
  color: var(--color-accent);
}

.faq-item-open .faq-question {
  color: var(--color-accent);
}

.faq-question:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

/* ==========================================================================
   FAQ Icon
   ========================================================================== */

.faq-icon {
  flex-shrink: 0;
  width: 1.25rem;
  height: 1.25rem;
  transition: transform var(--transition-base);
  color: var(--color-text-muted);
}

.faq-item-open .faq-icon {
  transform: rotate(180deg);
  color: var(--color-accent);
}

/* ==========================================================================
   FAQ Answer — Animated Expand/Collapse
   ========================================================================== */

.faq-answer {
  max-height: 0;
  overflow: hidden;
  transition: max-height var(--transition-slow);
}

.faq-answer p {
  padding-bottom: var(--space-5);
  font-size: var(--text-base);
  color: var(--color-text-secondary);
  line-height: var(--lh-body);
}

/* ==========================================================================
   Reduced Motion Support
   ========================================================================== */

@media (prefers-reduced-motion: reduce) {
  .faq-answer {
    transition: none;
  }

  .faq-icon {
    transition: none;
  }
}
</style>
