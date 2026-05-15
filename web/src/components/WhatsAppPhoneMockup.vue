<template>
  <div
    class="wpm"
    :class="[`wpm--${size}`, { 'wpm--tilt': tilt, 'wpm--interacting': isInteracting }]"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
    role="region"
    aria-label="Pré-visualização: vagas chegando no WhatsApp"
  >
    <div class="wpm-frame">
      <div class="wpm-notch"></div>
      <div class="wpm-screen">
        <header class="wpm-header">
          <button class="wpm-back" tabindex="-1" aria-label="Voltar">‹</button>
          <div class="wpm-avatar">S</div>
          <div class="wpm-meta">
            <div class="wpm-name">Sonnar</div>
            <div class="wpm-status">
              <span class="wpm-typing-dot"></span>
              <span class="wpm-typing-dot"></span>
              <span class="wpm-typing-dot"></span>
              <span class="wpm-status-text">digitando…</span>
            </div>
          </div>
          <div class="wpm-icons">
            <span>📞</span><span>⋮</span>
          </div>
        </header>

        <div class="wpm-body">
          <div class="wpm-day">hoje</div>
          <div
            ref="chatRef"
            class="wpm-chat"
          >
            <div class="wpm-scroll">
              <article
                v-for="(job, i) in jobsLoop"
                :key="i"
                class="wpm-msg"
              >
                <div class="wpm-msg-meta">
                  <span :class="['wpm-chip', job.match ? 'wpm-chip--wa' : 'wpm-chip--brand']">
                    {{ job.badge }}
                  </span>
                  <span class="wpm-time">{{ job.time }}</span>
                </div>
                <div :class="['wpm-card', { 'wpm-card--match': job.match }]">
                  <div class="wpm-role">{{ job.title }}</div>
                  <div class="wpm-company">{{ job.company }}</div>
                  <div class="wpm-tags">
                    <span v-for="t in job.tags" :key="t" class="wpm-chip">{{ t }}</span>
                  </div>
                  <div class="wpm-row">
                    <span class="wpm-loc">{{ job.location }}</span>
                    <span class="wpm-pay">{{ job.salary }}</span>
                  </div>
                  <div class="wpm-link">Ver vaga completa →</div>
                  <div class="wpm-via">{{ job.source }}</div>
                </div>
              </article>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="wpm-glow"></div>
  </div>
</template>

<script>
const DEFAULT_JOBS = [
  { badge: 'REMOTO · PJ',   title: 'Senior Backend Engineer',   company: 'Mercado Livre', tags: ['Go', 'Kafka', 'k8s'],             location: 'Remoto · LATAM',     salary: 'R$ 22k – 32k', source: 'via Gupy',      time: '09:41' },
  { badge: 'HÍBRIDO · CLT', title: 'Staff Frontend Engineer',   company: 'Nubank',        tags: ['React', 'TS', 'GraphQL'],         location: 'São Paulo · 2x/sem', salary: 'R$ 28k – 38k', source: 'via LinkedIn',  time: '09:41' },
  { badge: 'match · 96%',   title: 'Tech Lead - Plataforma',    company: 'PicPay',        tags: ['React', 'Node', 'AWS'],           location: 'Remoto · BR',        salary: 'R$ 25k – 35k', source: 'via Glassdoor', time: '09:42', match: true },
  { badge: 'REMOTO · CLT',  title: 'Senior Frontend Developer', company: 'Nubank',        tags: ['React', 'TypeScript', 'Node'],    location: 'Remoto',             salary: 'R$ 18k – 24k', source: 'via LinkedIn',  time: '09:47' },
  { badge: 'HÍBRIDO · SP',  title: 'Full Stack Engineer',       company: 'iFood',         tags: ['React', 'Python', 'AWS'],         location: 'São Paulo',          salary: 'R$ 15k – 20k', source: 'via Gupy',      time: '09:32' },
  { badge: 'REMOTO · PJ',   title: 'Backend Engineer',          company: 'Stone',         tags: ['Java', 'Spring', 'Kafka'],        location: 'Remoto',             salary: 'R$ 20k – 28k', source: 'via Glassdoor', time: '09:28' },
  { badge: 'REMOTO · CLT',  title: 'React Native Developer',    company: 'C6 Bank',       tags: ['React Native', 'TS'],             location: 'Remoto',             salary: 'R$ 14k – 19k', source: 'via LinkedIn',  time: '09:15' },
  { badge: 'HÍBRIDO · RJ',  title: 'DevOps Engineer',           company: 'Loft',          tags: ['Kubernetes', 'Terraform', 'AWS'], location: 'Rio de Janeiro',     salary: 'R$ 16k – 22k', source: 'via Indeed',    time: '09:08' }
]

export default {
  name: 'WhatsAppPhoneMockup',
  props: {
    size: {
      type: String,
      default: 'default',
      validator: v => ['default', 'compact'].includes(v)
    },
    tilt: { type: Boolean, default: true },
    jobs: { type: Array, default: () => DEFAULT_JOBS }
  },
  data() {
    return {
      // Modelo: target-driven com lerp por rAF.
      // - autoSpeed: velocidade base do scroll automatico (px/ms)
      // - smooth: fator de easing (0-1). Menor = mais "manteiga".
      // - targetScroll: pra onde el.scrollTop esta indo
      // - el.scrollTop persegue suavemente atras
      isHovered: false,
      isInteracting: false,
      targetScroll: 0,
      autoSpeed: 0.018,
      smooth: 0.12,
      rafId: null,
      lastTime: 0,
      interactTimeout: null,
      reduceMotion: false,
      wheelHandler: null
    }
  },
  computed: {
    // Lista duplicada cria loop visual seamless quando scroll atinge metade
    jobsLoop() {
      return [...this.jobs, ...this.jobs]
    }
  },
  mounted() {
    this.reduceMotion = typeof window !== 'undefined'
      && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const el = this.$refs.chatRef
    if (el) {
      this.wheelHandler = this.onWheel.bind(this)
      // passive:false pra permitir preventDefault e capturar o scroll
      el.addEventListener('wheel', this.wheelHandler, { passive: false })
    }

    if (!this.reduceMotion) {
      this.lastTime = performance.now()
      this.rafId = requestAnimationFrame(this.tick)
    }
  },
  beforeUnmount() {
    if (this.rafId) cancelAnimationFrame(this.rafId)
    if (this.interactTimeout) clearTimeout(this.interactTimeout)
    const el = this.$refs.chatRef
    if (el && this.wheelHandler) {
      el.removeEventListener('wheel', this.wheelHandler)
    }
  },
  methods: {
    /**
     * Loop principal - chamado a cada frame.
     * 1. Auto-scroll: incrementa target quando nao hovered.
     * 2. Lerp: scrollTop persegue target com easing.
     * 3. Loop normalize: ao cruzar metade, ajusta target+scrollTop juntos
     *    pra continuidade visual perfeita (lista duplicada).
     */
    tick(time) {
      const dt = time - this.lastTime
      this.lastTime = time
      const el = this.$refs.chatRef
      if (!el) {
        this.rafId = requestAnimationFrame(this.tick)
        return
      }

      const half = el.scrollHeight / 2

      // Auto incrementa target somente quando idle (sem hover/interacao)
      if (!this.isHovered && !this.isInteracting && half > 0) {
        this.targetScroll += dt * this.autoSpeed
      }

      // Normalize target dentro do loop
      if (half > 0) {
        while (this.targetScroll >= half) this.targetScroll -= half
        while (this.targetScroll < 0) this.targetScroll += half
      }

      // Lerp scrollTop -> target. Se a diferenca cruzar mais que meio loop,
      // pegamos o caminho mais curto (evita "rebobinar" visualmente).
      const cur = el.scrollTop
      let diff = this.targetScroll - cur
      if (half > 0 && Math.abs(diff) > half / 2) {
        if (diff > 0) diff -= half
        else diff += half
      }

      if (Math.abs(diff) > 0.1) {
        // dt-aware lerp: garante velocidade consistente mesmo em fps variavel
        const k = 1 - Math.pow(1 - this.smooth, dt / 16.67)
        let next = cur + diff * k

        // Wrap se sair dos limites
        if (next < 0) next += half
        else if (next >= half) next -= half

        el.scrollTop = next
      }

      this.rafId = requestAnimationFrame(this.tick)
    },

    onEnter() {
      this.isHovered = true
    },

    onLeave() {
      this.isHovered = false
      // Sincroniza target com posicao atual pra auto retomar SEM saltos.
      // Se nao fizessemos isso, o auto poderia disparar de uma posicao
      // distante (ex: usuario scrollou pra frente, sai do mockup, auto
      // continua de onde target estava - abrupto).
      const el = this.$refs.chatRef
      if (el) this.targetScroll = el.scrollTop
      // Limpa flag de interacao tambem
      if (this.interactTimeout) clearTimeout(this.interactTimeout)
      this.isInteracting = false
    },

    onWheel(e) {
      const el = this.$refs.chatRef
      if (!el) return
      // Captura o scroll dentro do mockup (loop infinito, sem extremos)
      e.preventDefault()
      this.targetScroll += e.deltaY
      // O lerp do tick faz a aproximacao suave
      this.markInteracting()
    },

    markInteracting() {
      this.isInteracting = true
      if (this.interactTimeout) clearTimeout(this.interactTimeout)
      this.interactTimeout = setTimeout(() => {
        this.isInteracting = false
      }, 1500)
    }
  }
}
</script>

<style scoped>
/* ============================================================
   WhatsApp Phone Mockup - componente reutilizavel
   - Design tokens do DS quando aplicavel
   - Cores internas da tela mantidas (paleta WhatsApp dark fixa,
     intencional: o "device" tem aparencia propria independente
     do tema da app)
   ============================================================ */

.wpm {
  --wpm-whatsapp: #25D366;
  --wpm-screen-bg: #0B1117;
  --wpm-screen-bg-2: #131B2A;
  --wpm-text-mute: #A0A8BD;
  --wpm-text-dim: #6B7390;
  /* Tom de marca puxado do token global da app - coerente light/dark */
  --wpm-brand-hi: var(--color-accent);
  --wpm-mono: 'JetBrains Mono', ui-monospace, monospace;

  position: relative;
  margin: 0 auto;
  filter: drop-shadow(0 30px 60px rgba(0, 0, 0, 0.45));
}

.wpm--default { width: 320px; aspect-ratio: 9 / 19; }
.wpm--compact { width: 240px; aspect-ratio: 9 / 19; }

@media (max-width: 460px) {
  .wpm--default { width: 280px; }
  .wpm--compact { width: 220px; }
}

@media (min-width: 1024px) {
  .wpm--tilt {
    transform: rotate(2deg);
    transition: transform var(--transition-slow);
  }
  .wpm--tilt:hover {
    transform: rotate(0deg) scale(1.02);
  }
}

/* Frame */
.wpm-frame {
  position: relative;
  width: 100%;
  height: 100%;
  background: linear-gradient(180deg, #2A3148, #181D2E);
  border-radius: 44px;
  padding: 8px;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.06) inset,
    0 0 0 2px rgba(0, 0, 0, 0.4),
    0 1px 0 rgba(255, 255, 255, 0.18) inset;
}

.wpm-notch {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  width: 90px;
  height: 22px;
  background: #000;
  border-radius: var(--radius-full);
  z-index: 2;
}

.wpm--compact .wpm-notch { width: 70px; height: 18px; top: 12px; }

.wpm-screen {
  position: relative;
  width: 100%;
  height: 100%;
  background: var(--wpm-screen-bg);
  border-radius: 36px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.wpm--compact .wpm-screen { border-radius: 28px; }

.wpm-glow {
  position: absolute;
  inset: -20px;
  z-index: -1;
  background: radial-gradient(ellipse at center, var(--color-primary-glow), transparent 60%);
  filter: blur(40px);
  pointer-events: none;
}

/* Header */
.wpm-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 38px 12px 10px;
  background: linear-gradient(180deg, #1F2937, #1A2332);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  flex-shrink: 0;
}

.wpm--compact .wpm-header { padding: 30px 10px 8px; gap: 8px; }

.wpm-back {
  background: none;
  border: none;
  color: var(--wpm-text-mute);
  font-size: 22px;
  padding: 0 4px;
  cursor: default;
  line-height: 1;
}

.wpm-avatar {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--color-accent), var(--color-accent-active));
  display: grid;
  place-items: center;
  color: #fff;
  font-weight: var(--font-bold);
  font-size: 13px;
  flex-shrink: 0;
}

.wpm--compact .wpm-avatar { width: 26px; height: 26px; font-size: 11px; }

.wpm-meta { flex: 1; min-width: 0; }

.wpm-name {
  color: #fff;
  font-size: 13px;
  font-weight: var(--font-semibold);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wpm--compact .wpm-name { font-size: 11px; }

.wpm-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  color: var(--wpm-whatsapp);
}

.wpm--compact .wpm-status { font-size: 9px; }

.wpm-typing-dot {
  width: 3px;
  height: 3px;
  background: var(--wpm-whatsapp);
  border-radius: var(--radius-full);
  animation: wpmType 1.2s ease-in-out infinite;
}
.wpm-typing-dot:nth-child(2) { animation-delay: 0.15s; }
.wpm-typing-dot:nth-child(3) { animation-delay: 0.3s; }

@keyframes wpmType {
  0%, 60%, 100% { opacity: 0.2; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-2px); }
}

.wpm-status-text { margin-left: 4px; opacity: 0.85; }

.wpm-icons {
  display: flex;
  gap: 14px;
  opacity: 0.5;
  font-size: 14px;
}
.wpm--compact .wpm-icons { gap: 10px; font-size: 12px; }

/* Body */
.wpm-body {
  flex: 1;
  padding: 12px 10px 14px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background:
    radial-gradient(circle at 20% 10%, color-mix(in srgb, var(--color-accent) 6%, transparent), transparent 50%),
    var(--wpm-screen-bg);
}

.wpm--compact .wpm-body { padding: 10px 8px 12px; gap: 8px; }

.wpm-day {
  align-self: center;
  font-size: 10px;
  color: var(--wpm-text-dim);
  background: rgba(255, 255, 255, 0.04);
  padding: 3px 10px;
  border-radius: var(--radius-full);
  text-transform: lowercase;
  flex-shrink: 0;
}

.wpm-chat {
  flex: 1;
  position: relative;
  overflow-y: auto;
  overflow-x: hidden;
  /* Cursor "mao" - sinaliza que o usuario pode arrastar/scroll */
  cursor: grab;
  /* Scroll suave em touchpad/touch */
  scroll-behavior: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;          /* Firefox */
  overscroll-behavior: contain;
}
.wpm-chat:active { cursor: grabbing; }
.wpm-chat::-webkit-scrollbar { display: none; }

/* Fades - agora ancoradas no .wpm-body (parent estático) pra nao rolarem
   junto com o scroll do .wpm-chat */
.wpm-body::before,
.wpm-body::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 32px;
  pointer-events: none;
  z-index: 5;
}
.wpm-body { position: relative; }
.wpm-body::before {
  top: 30px; /* abaixo do .wpm-day */
  background: linear-gradient(to bottom, var(--wpm-screen-bg) 0%, transparent 100%);
}
.wpm-body::after {
  bottom: 0;
  background: linear-gradient(to top, var(--wpm-screen-bg) 0%, transparent 100%);
}

.wpm-scroll {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 2px;
  /* Auto-scroll agora controlado por JS via scrollTop. Sem animation CSS. */
}

/* Cards */
.wpm-msg { flex-shrink: 0; }

.wpm-msg-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px 4px;
}

.wpm-time {
  font-size: 9.5px;
  color: var(--wpm-text-dim);
}

.wpm-card {
  background: linear-gradient(180deg, #182234, var(--wpm-screen-bg-2));
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 10px 12px;
}

.wpm-card--match {
  border-color: rgba(37, 211, 102, 0.3);
  background: linear-gradient(180deg, rgba(37, 211, 102, 0.08), var(--wpm-screen-bg-2));
}

.wpm-role {
  font-size: 13px;
  font-weight: var(--font-semibold);
  color: #fff;
  letter-spacing: var(--ls-tight);
}

.wpm-company {
  font-size: 11px;
  color: var(--wpm-text-mute);
  margin-bottom: 8px;
}

.wpm-tags {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.wpm-tags .wpm-chip {
  font-size: 9.5px;
  padding: 2px 6px;
}

.wpm-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 8px;
  border-top: 1px dashed rgba(255, 255, 255, 0.05);
  font-size: 10.5px;
  color: var(--wpm-text-mute);
}

.wpm-pay {
  color: #fff;
  font-weight: var(--font-semibold);
  font-variant-numeric: tabular-nums;
}

.wpm-link {
  margin-top: 8px;
  font-size: 11px;
  color: var(--wpm-brand-hi);
  font-weight: var(--font-medium);
}

.wpm-via {
  margin-top: 4px;
  font-size: 9.5px;
  color: var(--wpm-text-dim);
  font-family: var(--wpm-mono);
}

/* Chip */
.wpm-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--wpm-mono);
  font-size: 11px;
  letter-spacing: 0.04em;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  color: var(--wpm-text-mute);
}

.wpm-chip--brand {
  color: var(--wpm-brand-hi);
  border-color: color-mix(in srgb, var(--color-accent) 35%, transparent);
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
}

.wpm-chip--wa {
  color: var(--wpm-whatsapp);
  border-color: rgba(37, 211, 102, 0.25);
  background: rgba(37, 211, 102, 0.08);
}

@media (prefers-reduced-motion: reduce) {
  .wpm-typing-dot { animation: none; }
  .wpm--tilt:hover { transform: rotate(2deg); }
}

@media (hover: none) {
  .wpm--tilt:hover { transform: rotate(2deg); }
  .wpm-chat { cursor: auto; }
}
</style>
