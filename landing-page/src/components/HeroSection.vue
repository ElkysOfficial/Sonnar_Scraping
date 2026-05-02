<template>
  <section
    id="hero"
    class="hero"
  >
    <!-- Subtle Radial Detection Field -->
    <div class="hero-radial-field" aria-hidden="true"></div>

    <div class="container hero-content">
      <div class="hero-text">
        <h1 class="hero-title animate-fade-in-up">
          Vagas do seu stack.<br>
          <span class="hero-title__accent">Direto no WhatsApp.</span>
        </h1>
        <p class="hero-subtitle animate-fade-in-up stagger-2">
          Monitoramos 16+ fontes em tempo real e enviamos só as oportunidades que
          combinam com seu perfil. Sem duplicatas, sem ruído, sem caçar.
        </p>
        <div class="hero-ctas animate-fade-in-up stagger-3">
          <router-link
            to="/cadastro"
            class="btn btn-whatsapp btn-lg"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M10 2C5.58 2 2 5.58 2 10C2 11.85 2.63 13.55 3.69 14.91L2.5 18L5.72 16.85C7.01 17.64 8.46 18 10 18C14.42 18 18 14.42 18 10C18 5.58 14.42 2 10 2Z"
                fill="currentColor"
              />
            </svg>
            Receber vagas no WhatsApp
          </router-link>
        </div>
      </div>

      <div class="hero-mockup animate-fade-in-right stagger-2">
        <WhatsAppPhoneMockup />
      </div>
    </div>
  </section>
</template>

<script>
import WhatsAppPhoneMockup from './WhatsAppPhoneMockup.vue'

export default {
  name: 'HeroSection',
  components: { WhatsAppPhoneMockup }
}
</script>

<style scoped>
.hero {
  position: relative;
  padding: clamp(5rem, 12vh, 7.5rem) 0 clamp(3rem, 8vh, 5rem);
  background: var(--color-background);
  color: var(--color-text-primary);
  overflow: hidden;
}

/* Halo difuso atrás do hero (igual referência Stitch) */
.hero-radial-field {
  position: absolute;
  top: -10%;
  left: 50%;
  transform: translateX(-50%);
  width: min(1100px, 130%);
  height: 700px;
  background: radial-gradient(ellipse at center, var(--color-primary-glow) 0%, transparent 60%);
  filter: blur(120px);
  pointer-events: none;
  z-index: 0;
  animation: fieldPulse 12s ease-in-out infinite;
}

@keyframes fieldPulse {
  0%, 100% { opacity: 0.85; transform: translateX(-50%) scale(1); }
  50%      { opacity: 1;    transform: translateX(-50%) scale(1.04); }
}

.hero-content {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 1fr;
  gap: clamp(2.5rem, 6vw, 4rem);
  align-items: center;
}

@media (min-width: 1024px) {
  .hero-content {
    grid-template-columns: 1fr 1fr;
  }
}

.hero-text {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(1rem, 2.5vw, 1.5rem);
}

@media (min-width: 1024px) {
  .hero-text {
    text-align: left;
    align-items: flex-start;
    max-width: 32rem;
  }
}

.hero-title {
  font-size: clamp(2.5rem, 6vw, 4rem);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: var(--color-text-primary);
  margin: 0;
}

.hero-title__accent {
  color: var(--color-accent);
  text-shadow: 0 0 30px var(--color-primary-glow);
}

.hero-subtitle {
  font-size: 1.125rem;
  line-height: 1.6;
  color: var(--color-text-secondary);
  max-width: 30rem;
  margin: 0;
}

.hero-ctas {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  flex-direction: column;
  margin-top: 8px;
}

@media (min-width: 360px) {
  .hero-ctas {
    flex-direction: row;
    justify-content: center;
  }
}

@media (min-width: 1024px) {
  .hero-ctas {
    justify-content: flex-start;
  }
}

.hero-ctas .btn {
  width: 100%;
  justify-content: center;
}

@media (min-width: 360px) {
  .hero-ctas .btn {
    width: auto;
  }
}

/* ==========================================================================
   Container do mockup — estilos do mockup ficam em WhatsAppPhoneMockup.vue
   ========================================================================== */

.hero-mockup {
  display: flex;
  justify-content: center;
}
</style>
