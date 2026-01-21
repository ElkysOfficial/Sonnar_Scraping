<template>
  <section id="hero" class="hero">
    <div class="container hero-content">
      <div class="hero-text">
        <h1 class="hero-title">
          Vagas do seu stack.<br>
          Direto no WhatsApp.
        </h1>
        <p class="hero-subtitle">
          Monitoramos mais de 16 fontes e enviamos apenas vagas relevantes
          para o seu perfil. Sem duplicatas, sem ruído.
        </p>
        <div class="hero-ctas">
          <a href="#contato" class="btn btn-whatsapp btn-lg">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M10 2C5.58 2 2 5.58 2 10C2 11.85 2.63 13.55 3.69 14.91L2.5 18L5.72 16.85C7.01 17.64 8.46 18 10 18C14.42 18 18 14.42 18 10C18 5.58 14.42 2 10 2Z" fill="currentColor"/>
            </svg>
            Receber vagas no WhatsApp
          </a>
          <a href="#como-funciona" class="btn btn-secondary btn-lg">
            Ver exemplo de vaga
          </a>
        </div>
        <p class="hero-social-proof">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" class="social-proof-icon">
            <circle cx="8" cy="8" r="6" fill="var(--color-success)"/>
            <path d="M5.5 8L7 9.5L10.5 6" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          1.247 devs recebendo vagas esta semana
        </p>
      </div>

      <div class="hero-mockup">
        <div class="phone-wrapper" @mouseenter="pause" @mouseleave="resume">
          <!-- iPhone SVG Frame -->
          <svg class="phone-svg" viewBox="0 0 280 572" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="frameGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#e8e8e8"/>
                <stop offset="50%" stop-color="#c0c0c0"/>
                <stop offset="100%" stop-color="#e8e8e8"/>
              </linearGradient>
              <clipPath id="screenClip">
                <rect x="12" y="12" width="256" height="548" rx="36"/>
              </clipPath>
            </defs>


            <!-- Frame do iPhone -->
            <rect x="0" y="0" width="280" height="572" rx="52" fill="url(#frameGrad)"/>
            <rect x="4" y="4" width="272" height="564" rx="48" fill="#1a1a1a"/>

            <!-- Tela (área de clipping) -->
            <rect x="12" y="12" width="256" height="548" rx="36" fill="#0B141A"/>

            <!-- Dynamic Island -->
            <rect x="95" y="20" width="90" height="28" rx="14" fill="#000"/>

            <!-- Botões laterais -->
            <rect x="278" y="120" width="3" height="60" rx="1.5" fill="#888"/>
            <rect x="-1" y="100" width="3" height="32" rx="1.5" fill="#888"/>
            <rect x="-1" y="150" width="3" height="50" rx="1.5" fill="#888"/>
            <rect x="-1" y="210" width="3" height="50" rx="1.5" fill="#888"/>
          </svg>

          <!-- Conteúdo da tela com WhatsApp -->
          <div class="phone-screen">
            <!-- Header do WhatsApp -->
            <div class="wa-header">
              <div class="wa-back">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M11 14L6 9L11 4" stroke="#8696A0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <div class="wa-avatar">S</div>
              <div class="wa-info">
                <span class="wa-name">Sonnar</span>
                <span class="wa-status">digitando...</span>
              </div>
            </div>

            <!-- Chat com mensagens scrollando -->
            <div class="wa-chat">
              <div class="messages-scroll" :class="{ paused: isPaused }">
                <div class="msg" v-for="(job, i) in jobs" :key="i">
                  <div class="msg-badge">{{ job.badge }}</div>
                  <div class="msg-title">{{ job.title }}</div>
                  <div class="msg-company">{{ job.company }}</div>
                  <div class="msg-tags">
                    <span v-for="t in job.tags" :key="t">{{ t }}</span>
                  </div>
                  <div class="msg-info">
                    <span>{{ job.location }}</span>
                    <span>{{ job.salary }}</span>
                  </div>
                  <div class="msg-cta">Ver vaga completa</div>
                  <div class="msg-footer">
                    <span>{{ job.source }}</span>
                    <span>{{ job.time }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script>
export default {
  name: 'HeroSection',
  data() {
    return {
      isPaused: false,
      jobs: [
        { badge: 'Remoto · CLT', title: 'Senior Frontend Developer', company: 'Nubank', tags: ['React', 'TypeScript', 'Node.js'], location: 'Remoto', salary: 'R$ 18k - 24k', source: 'via LinkedIn', time: '09:47' },
        { badge: 'Híbrido · SP', title: 'Full Stack Engineer', company: 'iFood', tags: ['React', 'Python', 'AWS'], location: 'São Paulo', salary: 'R$ 15k - 20k', source: 'via Gupy', time: '09:32' },
        { badge: 'Remoto · PJ', title: 'Backend Engineer', company: 'Mercado Livre', tags: ['Java', 'Spring', 'Kafka'], location: 'Remoto', salary: 'R$ 20k - 28k', source: 'via Glassdoor', time: '09:28' },
        { badge: 'Remoto · CLT', title: 'React Native Developer', company: 'PicPay', tags: ['React Native', 'TypeScript'], location: 'Remoto', salary: 'R$ 14k - 19k', source: 'via LinkedIn', time: '09:15' },
        { badge: 'Híbrido · RJ', title: 'DevOps Engineer', company: 'Stone', tags: ['Kubernetes', 'Terraform', 'AWS'], location: 'Rio de Janeiro', salary: 'R$ 16k - 22k', source: 'via Indeed', time: '09:08' },
        { badge: 'Remoto · CLT', title: 'Tech Lead Frontend', company: 'Loft', tags: ['React', 'Next.js', 'GraphQL'], location: 'Remoto', salary: 'R$ 22k - 30k', source: 'via Gupy', time: '08:55' },
        { badge: 'Remoto · CLT', title: 'Senior Backend Developer', company: 'C6 Bank', tags: ['Go', 'PostgreSQL', 'Docker'], location: 'Remoto', salary: 'R$ 19k - 26k', source: 'via LinkedIn', time: '08:42' },
        { badge: 'Híbrido · SP', title: 'Mobile Engineer', company: '99', tags: ['Flutter', 'Dart', 'Firebase'], location: 'São Paulo', salary: 'R$ 16k - 21k', source: 'via Glassdoor', time: '08:30' },
        { badge: 'Remoto · CLT', title: 'Senior Frontend Developer', company: 'Nubank', tags: ['React', 'TypeScript', 'Node.js'], location: 'Remoto', salary: 'R$ 18k - 24k', source: 'via LinkedIn', time: '09:47' },
        { badge: 'Híbrido · SP', title: 'Full Stack Engineer', company: 'iFood', tags: ['React', 'Python', 'AWS'], location: 'São Paulo', salary: 'R$ 15k - 20k', source: 'via Gupy', time: '09:32' },
        { badge: 'Remoto · PJ', title: 'Backend Engineer', company: 'Mercado Livre', tags: ['Java', 'Spring', 'Kafka'], location: 'Remoto', salary: 'R$ 20k - 28k', source: 'via Glassdoor', time: '09:28' },
        { badge: 'Remoto · CLT', title: 'React Native Developer', company: 'PicPay', tags: ['React Native', 'TypeScript'], location: 'Remoto', salary: 'R$ 14k - 19k', source: 'via LinkedIn', time: '09:15' },
      ]
    }
  },
  methods: {
    pause() { this.isPaused = true },
    resume() { this.isPaused = false }
  }
}
</script>

<style scoped>
.hero {
  padding: clamp(5rem, 12vh, 7.5rem) 0 clamp(3rem, 8vh, 5rem);
  background: var(--color-background);
  overflow: hidden;
}

.hero-content {
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
}

@media (min-width: 1024px) {
  .hero-text {
    text-align: left;
    max-width: 32rem;
  }
}

.hero-title {
  font-size: var(--text-hero);
  font-weight: var(--font-bold);
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: var(--color-text-primary);
  margin-bottom: clamp(1rem, 3vw, 1.5rem);
}

.hero-subtitle {
  font-size: var(--text-lg);
  line-height: 1.6;
  color: var(--color-text-secondary);
  margin-bottom: clamp(1.5rem, 4vw, 2rem);
}

.hero-ctas {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-bottom: clamp(1.25rem, 3vw, 1.5rem);
  flex-direction: column;
}

@media (min-width: 480px) {
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

@media (min-width: 480px) {
  .hero-ctas .btn {
    width: auto;
  }
}

.hero-social-proof {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

@media (min-width: 1024px) {
  .hero-social-proof {
    justify-content: flex-start;
  }
}

/* ==========================================================================
   Phone Mockup
   ========================================================================== */

.hero-mockup {
  display: flex;
  justify-content: center;
}

.phone-wrapper {
  position: relative;
  width: min(65vw, 260px);
}

@media (min-width: 480px) {
  .phone-wrapper { width: min(50vw, 260px); }
}

@media (min-width: 768px) {
  .phone-wrapper { width: min(35vw, 280px); }
}

@media (min-width: 1024px) {
  .phone-wrapper {
    width: 280px;
    transform: rotate(2deg);
    transition: transform 0.3s ease;
  }
  .phone-wrapper:hover {
    transform: rotate(0deg) scale(1.02);
  }
}

.phone-svg {
  width: 100%;
  height: auto;
  display: block;
}

/* ==========================================================================
   Phone Screen - Posicionamento perfeito sem bordas
   ========================================================================== */

.phone-screen {
  position: absolute;
  top: 2.1%;
  left: 4.3%;
  right: 4.3%;
  bottom: 2.1%;
  border-radius: 36px;
  overflow: hidden;
  background: #0B141A;
}

/* WhatsApp Header */
.wa-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #1F2C34;
}

.wa-back {
  display: flex;
  align-items: center;
}

.wa-avatar {
  width: 32px;
  height: 32px;
  background: var(--color-accent);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 700;
  font-size: 13px;
}

.wa-info {
  display: flex;
  flex-direction: column;
}

.wa-name {
  color: #E9EDEF;
  font-size: 14px;
  font-weight: 500;
}

.wa-status {
  color: #25D366;
  font-size: 11px;
}

/* ==========================================================================
   Chat Area com Scroll Infinito
   ========================================================================== */

.wa-chat {
  height: calc(100% - 52px);
  overflow: hidden;
  position: relative;
}

/* Fade superior e inferior suave */
.wa-chat::before,
.wa-chat::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 40px;
  pointer-events: none;
  z-index: 5;
}

.wa-chat::before {
  top: 0;
  background: linear-gradient(to bottom, #0B141A 0%, transparent 100%);
}

.wa-chat::after {
  bottom: 0;
  background: linear-gradient(to top, #0B141A 0%, transparent 100%);
}

.messages-scroll {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 15px 10px;
  animation: scroll 35s linear infinite;
}

.messages-scroll.paused {
  animation-play-state: paused;
}

@keyframes scroll {
  0% { transform: translateY(0); }
  100% { transform: translateY(-50%); }
}

/* ==========================================================================
   Message Card - Design limpo
   ========================================================================== */

.msg {
  background: #1F2C34;
  border-radius: 10px;
  border-top-left-radius: 2px;
  padding: 10px 12px;
  flex-shrink: 0;
}

.msg-badge {
  font-size: 9px;
  color: #25D366;
  font-weight: 600;
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.msg-title {
  font-size: 13px;
  font-weight: 600;
  color: #E9EDEF;
  margin-bottom: 2px;
}

.msg-company {
  font-size: 11px;
  color: #8696A0;
  margin-bottom: 8px;
}

.msg-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}

.msg-tags span {
  font-size: 9px;
  padding: 3px 7px;
  background: rgba(255,255,255,0.08);
  border-radius: 4px;
  color: #8696A0;
}

.msg-info {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: #8696A0;
  margin-bottom: 8px;
}

.msg-cta {
  font-size: 11px;
  color: #53BDEB;
  padding-top: 8px;
  border-top: 1px solid rgba(255,255,255,0.06);
}

.msg-footer {
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  color: #667781;
  margin-top: 6px;
}

/* Reduced Motion */
@media (prefers-reduced-motion: reduce) {
  .messages-scroll { animation: none; }
  .phone-wrapper:hover { transform: rotate(2deg); }
}

@media (hover: none) {
  .phone-wrapper:hover { transform: rotate(2deg); }
}
</style>
