<template>
  <section class="proof-bar">
    <div class="container proof-bar__inner">
      <div class="proof-bar__group">
        <div class="proof-bar__avatars" aria-hidden="true">
          <div class="proof-bar__avatar proof-bar__avatar--gradient-a">
            <span>JM</span>
          </div>
          <div class="proof-bar__avatar proof-bar__avatar--gradient-b">
            <span>LC</span>
          </div>
          <div class="proof-bar__avatar proof-bar__avatar--count">
            +2k
          </div>
        </div>
        <span class="proof-bar__quote">Aprovado por talentos seniores</span>
      </div>

      <div class="proof-bar__divider" aria-hidden="true"></div>

      <div class="proof-bar__group proof-bar__group--metric">
        <span class="proof-bar__pulse" aria-hidden="true"></span>
        <p class="proof-bar__metric">
          Já detectamos <span class="proof-bar__metric-value">{{ formattedTotalCount }}</span> vagas
        </p>
      </div>
    </div>
  </section>
</template>

<script>
import { computed, onMounted } from 'vue'
import { useJobsCoverage } from '@/composables/useJobsCoverage'

export default {
  name: 'SocialProofBar',
  setup() {
    const { stats, load } = useJobsCoverage()
    onMounted(() => { load() })

    // Fallback estatico enquanto carrega ou se RPC falha - evita "0 vagas".
    // Usa total_count (mesma metrica somada no mapa) pra evitar divergencia
    // entre "vagas extraidas" no mapa e a barra de prova social.
    const FALLBACK_TOTAL = 1247
    const formattedTotalCount = computed(() => {
      const value = stats.value.total_count || FALLBACK_TOTAL
      return value.toLocaleString('pt-BR')
    })

    return { formattedTotalCount }
  }
}
</script>

<style scoped>
.proof-bar {
  background: var(--color-surface-low, var(--color-surface));
  border-top: 1px solid var(--color-border-subtle);
  border-bottom: 1px solid var(--color-border-subtle);
  padding: 48px 0;
  color: var(--color-text-primary);
}

.proof-bar__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  text-align: center;
}

@media (min-width: 768px) {
  .proof-bar__inner {
    flex-direction: row;
    gap: 48px;
  }
}

.proof-bar__group {
  display: inline-flex;
  align-items: center;
  gap: 16px;
}

.proof-bar__group--metric {
  gap: 12px;
}

/* Avatars empilhados */
.proof-bar__avatars {
  display: inline-flex;
  align-items: center;
}

.proof-bar__avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid var(--color-background);
  background: var(--color-surface-elevated);
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  font-family: var(--font-family);
}

.proof-bar__avatar:not(:first-child) {
  margin-left: -12px;
}

.proof-bar__avatar--gradient-a {
  background: linear-gradient(135deg, var(--color-accent) 0%, #7C3AED 100%);
}
.proof-bar__avatar--gradient-b {
  background: linear-gradient(135deg, #06B6D4 0%, var(--color-accent) 100%);
}

.proof-bar__avatar--count {
  background: var(--color-surface-elevated);
  color: var(--color-text-primary);
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.proof-bar__quote {
  font-style: italic;
  color: var(--color-text-secondary);
  font-size: 1rem;
}

/* Divisor vertical */
.proof-bar__divider {
  display: none;
  width: 1px;
  height: 32px;
  background: var(--color-border);
}

@media (min-width: 768px) {
  .proof-bar__divider {
    display: block;
  }
}

/* Pulso ciano (identidade Sonnar) */
.proof-bar__pulse {
  position: relative;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-secondary);
  flex-shrink: 0;
  box-shadow: 0 0 0 0 var(--color-secondary-glow);
  animation: proofPulse 2s ease-in-out infinite;
}

@keyframes proofPulse {
  0%, 100% {
    box-shadow: 0 0 0 0 var(--color-secondary-glow);
    opacity: 1;
  }
  50% {
    box-shadow: 0 0 0 8px transparent;
    opacity: 0.85;
  }
}

.proof-bar__metric {
  font-size: clamp(1.125rem, 2vw, 1.5rem);
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.01em;
  color: var(--color-text-primary);
  margin: 0;
}

.proof-bar__metric-value {
  color: var(--color-secondary);
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

@media (prefers-reduced-motion: reduce) {
  .proof-bar__pulse { animation: none; }
}
</style>
