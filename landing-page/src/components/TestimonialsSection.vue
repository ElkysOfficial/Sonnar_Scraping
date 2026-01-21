<template>
  <section id="depoimentos" class="section testimonials">
    <div class="container">
      <div class="section-header">
        <h2 class="section-title">O que dizem nossos usuários</h2>
        <p class="section-subtitle">
          Desenvolvedores reais compartilhando suas experiências com o Sonnar.
        </p>
      </div>

      <div class="testimonials-grid">
        <article class="testimonial-card" v-for="(testimonial, index) in testimonials" :key="index">
          <div class="testimonial-content">
            <svg class="quote-icon" width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <path d="M8 20C8 16.686 10.686 14 14 14V10C8.477 10 4 14.477 4 20V26H14V20H8ZM22 20C22 16.686 24.686 14 28 14V10C22.477 10 18 14.477 18 20V26H28V20H22Z" fill="var(--color-primary-soft)"/>
            </svg>
            <p class="testimonial-text">{{ testimonial.text }}</p>
          </div>
          <div class="testimonial-author">
            <div class="author-avatar" :style="{ background: testimonial.avatarBg }">
              {{ testimonial.initials }}
            </div>
            <div class="author-info">
              <span class="author-name">{{ testimonial.name }}</span>
              <span class="author-role">{{ testimonial.role }}</span>
            </div>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<script>
export default {
  name: 'TestimonialsSection',
  data() {
    return {
      testimonials: [
        {
          text: 'Economizo pelo menos 2 horas por dia que gastava vasculhando LinkedIn e sites de vaga. O Sonnar entrega exatamente o que preciso no meu stack.',
          name: 'Marcos S.',
          role: 'Senior Frontend Developer',
          initials: 'MS',
          avatarBg: 'var(--gradient-hero)'
        },
        {
          text: 'O filtro por senioridade funciona muito bem. Parei de receber vagas júnior ou muito acima do meu nível. Recomendo o plano VIP.',
          name: 'Carolina R.',
          role: 'Full Stack Developer',
          initials: 'CR',
          avatarBg: 'linear-gradient(135deg, #16A34A 0%, #22D3EE 100%)'
        },
        {
          text: 'A deduplicação é o diferencial. Recebia a mesma vaga de 5 fontes diferentes, agora vejo cada oportunidade uma única vez.',
          name: 'Pedro L.',
          role: 'Backend Engineer',
          initials: 'PL',
          avatarBg: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)'
        }
      ]
    }
  }
}
</script>

<style scoped>
/* ==========================================================================
   Testimonials Section
   ========================================================================== */

.testimonials {
  background: var(--color-background);
}

/* ==========================================================================
   Testimonials Grid — Mobile-First
   ========================================================================== */

.testimonials-grid {
  display: grid;
  /* Mobile: single column */
  grid-template-columns: 1fr;
  gap: var(--space-4);
}

/* Tablet: 2 columns */
@media (min-width: 640px) {
  .testimonials-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-5);
  }

  /* Center the last item when odd number */
  .testimonial-card:last-child:nth-child(odd) {
    grid-column: 1 / -1;
    max-width: 50%;
    justify-self: center;
  }
}

/* Desktop: 3 columns */
@media (min-width: 1024px) {
  .testimonials-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-6);
  }

  .testimonial-card:last-child:nth-child(odd) {
    max-width: 100%;
    grid-column: auto;
    justify-self: auto;
  }
}

/* ==========================================================================
   Testimonial Card
   ========================================================================== */

.testimonial-card {
  background: var(--color-surface);
  border-radius: var(--radius-xl);
  padding: clamp(1.25rem, 4vw, 2rem);
  border: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  transition: all var(--transition-base);
}

.testimonial-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-md);
  border-color: var(--color-primary-soft);
}

/* ==========================================================================
   Testimonial Content
   ========================================================================== */

.testimonial-content {
  flex: 1;
}

.quote-icon {
  width: clamp(1.5rem, 4vw, 2rem);
  height: clamp(1.5rem, 4vw, 2rem);
  margin-bottom: var(--space-3);
}

.testimonial-text {
  font-size: var(--text-base);
  color: var(--color-text-secondary);
  line-height: 1.8;
  font-style: italic;
}

/* ==========================================================================
   Testimonial Author
   ========================================================================== */

.testimonial-author {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding-top: var(--space-5);
  border-top: 1px solid var(--color-border);
}

.author-avatar {
  width: clamp(2.5rem, 6vw, 3rem);
  height: clamp(2.5rem, 6vw, 3rem);
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: var(--text-sm);
  font-weight: var(--font-bold);
  flex-shrink: 0;
}

.author-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.author-name {
  font-size: var(--text-base);
  font-weight: var(--font-semibold);
  color: var(--color-text-primary);
}

.author-role {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  /* Truncate long role text */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ==========================================================================
   Touch Device Optimizations
   ========================================================================== */

@media (hover: none) and (pointer: coarse) {
  .testimonial-card:hover {
    transform: none;
    box-shadow: none;
    border-color: var(--color-border);
  }
}
</style>
