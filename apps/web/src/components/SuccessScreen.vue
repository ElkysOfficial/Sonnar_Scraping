<template>
  <div class="success-screen">
    <!-- Background with map and radar (subtle) -->
    <div class="success-screen__background">
      <img
        src="/world.svg"
        alt=""
        class="success-screen__map"
      >
      <div class="success-screen__radar-sweep" />

      <!-- Random detection points -->
      <div class="success-screen__detections">
        <span
          v-for="point in detectionPoints"
          :key="point.id"
          class="success-screen__detection"
          :style="{
            top: point.top + '%',
            left: point.left + '%',
            animationDelay: point.delay + 's'
          }"
        />
      </div>

      <div class="success-screen__pulse success-screen__pulse--1" />
      <div class="success-screen__pulse success-screen__pulse--2" />
      <div class="success-screen__grid" />
    </div>

    <!-- Content -->
    <div class="success-screen__content">
      <!-- Animated Success Icon -->
      <div class="success-screen__icon-wrapper">
        <div class="success-screen__circle success-screen__circle--outer" />
        <div class="success-screen__circle success-screen__circle--inner" />
        <div class="success-screen__checkmark">
          <svg
            viewBox="0 0 52 52"
            class="success-screen__checkmark-svg"
          >
            <circle
              class="success-screen__checkmark-circle"
              cx="26"
              cy="26"
              r="23"
              fill="none"
            />
            <path
              class="success-screen__checkmark-check"
              fill="none"
              d="M14.1 27.2l7.1 7.2 16.7-16.8"
            />
          </svg>
        </div>
      </div>

      <!-- Title -->
      <h2 class="success-screen__title">
        {{ title }}
      </h2>

      <!-- Subtitle -->
      <p class="success-screen__subtitle">
        {{ subtitle }}
      </p>

      <!-- Community Links (for free plan) -->
      <div
        v-if="showCommunityLinks"
        class="success-screen__communities"
      >
        <p class="success-screen__communities-label">
          Acesse suas comunidades:
        </p>

        <div class="success-screen__links">
          <a
            href="https://discord.gg/developers-202147515766800384"
            target="_blank"
            rel="noopener noreferrer"
            class="success-screen__link success-screen__link--discord"
          >
            <span class="success-screen__link-icon">
              <DiscordIcon />
            </span>
            <span class="success-screen__link-content">
              <span class="success-screen__link-title">Discord</span>
              <span class="success-screen__link-subtitle">Comunidade de desenvolvedores</span>
            </span>
            <span class="success-screen__link-arrow">
              <ArrowRightOutlined />
            </span>
          </a>

          <a
            href="https://chat.whatsapp.com/IcXxMiKwd4Z9bnsn9FsO4j"
            target="_blank"
            rel="noopener noreferrer"
            class="success-screen__link success-screen__link--whatsapp"
          >
            <span class="success-screen__link-icon">
              <WhatsAppIcon />
            </span>
            <span class="success-screen__link-content">
              <span class="success-screen__link-title">WhatsApp</span>
              <span class="success-screen__link-subtitle">Grupo da comunidade</span>
            </span>
            <span class="success-screen__link-arrow">
              <ArrowRightOutlined />
            </span>
          </a>
        </div>
      </div>

      <!-- Back to Home -->
      <router-link
        to="/"
        class="success-screen__back"
      >
        <ArrowLeftOutlined />
        Voltar para o início
      </router-link>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted } from 'vue'
import { ArrowRightOutlined, ArrowLeftOutlined } from '@ant-design/icons-vue'
import { DiscordIcon, WhatsAppIcon } from './icons/SocialIcons.vue'

export default {
  name: 'SuccessScreen',
  components: {
    ArrowRightOutlined,
    ArrowLeftOutlined,
    DiscordIcon,
    WhatsAppIcon
  },
  props: {
    title: {
      type: String,
      default: 'Cadastro realizado!'
    },
    subtitle: {
      type: String,
      default: 'Seu cadastro foi concluído com sucesso.'
    },
    showCommunityLinks: {
      type: Boolean,
      default: false
    }
  },
  setup() {
    const detectionPoints = ref([])
    let pointInterval = null
    let pointId = 0

    // Generate random detection points
    const generateRandomPoints = () => {
      const numPoints = Math.floor(Math.random() * 3) + 2 // 2-4 points (fewer for subtle effect)
      const newPoints = []

      for (let i = 0; i < numPoints; i++) {
        newPoints.push({
          id: ++pointId,
          top: Math.random() * 60 + 20,
          left: Math.random() * 70 + 15,
          delay: Math.random() * 0.8
        })
      }

      detectionPoints.value = newPoints
    }

    onMounted(() => {
      generateRandomPoints()
      pointInterval = setInterval(generateRandomPoints, 8000) // Slower for success screen
    })

    onUnmounted(() => {
      if (pointInterval) clearInterval(pointInterval)
    })

    return {
      detectionPoints
    }
  }
}
</script>

<style scoped>
.success-screen {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: var(--space-8);
  text-align: center;
  background: radial-gradient(ellipse at center, #0f172a 0%, #020617 100%);
  overflow: hidden;
}

/* Background Effects */
.success-screen__background {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.success-screen__map {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 90%;
  height: 90%;
  max-width: 1400px;
  object-fit: contain;
  opacity: 0.06;
  filter: brightness(0) saturate(100%) invert(40%) sepia(90%) saturate(1200%) hue-rotate(190deg);
  animation: map-float 8s ease-in-out infinite;
}

@keyframes map-float {
  0%, 100% { opacity: 0.04; transform: translate(-50%, -50%) scale(1); }
  50% { opacity: 0.08; transform: translate(-50%, -50%) scale(1.02); }
}

.success-screen__radar-sweep {
  position: absolute;
  top: 0;
  left: -20%;
  width: 20%;
  height: 100%;
  background: linear-gradient(90deg,
    transparent 0%,
    color-mix(in srgb, var(--color-accent) 2%, transparent) 50%,
    rgba(96, 165, 250, 0.05) 80%,
    rgba(147, 197, 253, 0.08) 95%,
    transparent 100%
  );
  animation: sweep-slow 8s ease-in-out infinite;
}

.success-screen__radar-sweep::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 1px;
  height: 100%;
  background: linear-gradient(180deg, transparent 20%, rgba(147, 197, 253, 0.4) 50%, transparent 80%);
  box-shadow: 0 0 10px rgba(147, 197, 253, 0.3);
}

@keyframes sweep-slow {
  0% { left: -20%; opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { left: 100%; opacity: 0; }
}

/* Random Detection points */
.success-screen__detections {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.success-screen__detection {
  position: absolute;
  width: 8px;
  height: 8px;
  background: radial-gradient(circle, var(--color-accent-hover) 0%, var(--color-accent) 40%, transparent 70%);
  border-radius: 50%;
  opacity: 0;
  animation: detection-pulse 8s ease-out forwards;
}

.success-screen__detection::before {
  content: '';
  position: absolute;
  inset: -4px;
  border: 1px solid rgba(96, 165, 250, 0.4);
  border-radius: 50%;
  animation: detection-ring 8s ease-out forwards;
}

.success-screen__detection::after {
  content: '';
  position: absolute;
  inset: -2px;
  background: rgba(96, 165, 250, 0.3);
  border-radius: 50%;
  filter: blur(4px);
  animation: detection-glow 8s ease-out forwards;
}

@keyframes detection-pulse {
  0% { opacity: 0; transform: scale(0); }
  10% { opacity: 0.8; transform: scale(1.3); }
  15% { transform: scale(1); }
  50% { opacity: 0.5; }
  100% { opacity: 0; transform: scale(0.8); }
}

@keyframes detection-ring {
  0% { transform: scale(0.5); opacity: 0; }
  10% { opacity: 0.6; }
  100% { transform: scale(3); opacity: 0; }
}

@keyframes detection-glow {
  0% { opacity: 0; }
  10% { opacity: 0.6; }
  50% { opacity: 0.3; }
  100% { opacity: 0; }
}

.success-screen__pulse {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100vmax;
  height: 100vmax;
  border: 1px solid var(--color-accent-soft);
  border-radius: 50%;
  animation: pulse-out 10s ease-out infinite;
}

.success-screen__pulse--2 {
  animation-delay: 5s;
}

@keyframes pulse-out {
  0% { transform: translate(-50%, -50%) scale(0); opacity: 0.4; }
  100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
}

.success-screen__grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(color-mix(in srgb, var(--color-accent) 2%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--color-accent) 2%, transparent) 1px, transparent 1px);
  background-size: 80px 80px;
}

/* Content */
.success-screen__content {
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  animation: fadeIn 0.5s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Animated Success Icon */
.success-screen__icon-wrapper {
  position: relative;
  width: 120px;
  height: 120px;
  margin-bottom: var(--space-8);
}

.success-screen__circle {
  position: absolute;
  border-radius: 50%;
}

.success-screen__circle--outer {
  inset: 0;
  background: var(--color-success);
  opacity: 0.1;
  animation: scaleIn 0.5s ease forwards;
}

.success-screen__circle--inner {
  inset: 15px;
  background: var(--color-success);
  opacity: 0.2;
  animation: scaleIn 0.5s ease 0.1s forwards;
  transform: scale(0);
}

@keyframes scaleIn {
  from {
    transform: scale(0);
  }
  to {
    transform: scale(1);
  }
}

.success-screen__checkmark {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.success-screen__checkmark-svg {
  width: 80px;
  height: 80px;
}

.success-screen__checkmark-circle {
  stroke: var(--color-success);
  stroke-width: 2;
  stroke-dasharray: 166;
  stroke-dashoffset: 166;
  animation: stroke 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
}

.success-screen__checkmark-check {
  stroke: var(--color-success);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 48;
  stroke-dashoffset: 48;
  animation: stroke 0.3s cubic-bezier(0.65, 0, 0.45, 1) 0.4s forwards;
}

@keyframes stroke {
  100% {
    stroke-dashoffset: 0;
  }
}

/* Title & Subtitle */
.success-screen__title {
  font-size: var(--text-3xl);
  font-weight: var(--font-bold);
  color: #f1f5f9;
  margin-bottom: var(--space-2);
  line-height: var(--lh-title);
  letter-spacing: var(--ls-tight);
  text-shadow: 0 0 30px rgba(96, 165, 250, 0.2);
}

.success-screen__subtitle {
  font-size: var(--text-lg);
  color: #94a3b8;
  margin-bottom: var(--space-8);
  max-width: 400px;
  line-height: var(--lh-body);
}

/* Community Links */
.success-screen__communities {
  width: 100%;
  max-width: 440px;
  animation: slideUp 0.5s ease 0.3s both;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.success-screen__communities-label {
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  color: #e2e8f0;
  margin-bottom: var(--space-4);
  text-transform: uppercase;
  letter-spacing: var(--ls-wide);
}

.success-screen__links {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-bottom: var(--space-6);
}

.success-screen__link {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  border-radius: var(--radius-lg);
  text-decoration: none;
  transition: all var(--transition-fast);
  border: 2px solid transparent;
  backdrop-filter: blur(8px);
}

.success-screen__link--discord {
  background: linear-gradient(135deg, rgba(88, 101, 242, 0.15) 0%, rgba(88, 101, 242, 0.08) 100%);
  border-color: rgba(88, 101, 242, 0.25);
}

.success-screen__link--discord:hover {
  background: linear-gradient(135deg, rgba(88, 101, 242, 0.2) 0%, rgba(88, 101, 242, 0.12) 100%);
  border-color: rgba(88, 101, 242, 0.5);
  transform: translateX(4px);
}

.success-screen__link--whatsapp {
  background: linear-gradient(135deg, rgba(37, 211, 102, 0.15) 0%, rgba(37, 211, 102, 0.08) 100%);
  border-color: rgba(37, 211, 102, 0.25);
}

.success-screen__link--whatsapp:hover {
  background: linear-gradient(135deg, rgba(37, 211, 102, 0.2) 0%, rgba(37, 211, 102, 0.12) 100%);
  border-color: rgba(37, 211, 102, 0.5);
  transform: translateX(4px);
}

.success-screen__link-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  font-size: 24px;
}

.success-screen__link--discord .success-screen__link-icon {
  background: #5865F2;
  color: white;
}

.success-screen__link--whatsapp .success-screen__link-icon {
  background: #25D366;
  color: white;
}

.success-screen__link-content {
  flex: 1;
  text-align: left;
}

.success-screen__link-title {
  display: block;
  font-size: var(--text-base);
  font-weight: var(--font-semibold);
  color: #f1f5f9;
  margin-bottom: 2px;
}

.success-screen__link-subtitle {
  display: block;
  font-size: var(--text-sm);
  color: #94a3b8;
}

.success-screen__link-arrow {
  color: #64748b;
  transition: transform var(--transition-fast);
}

.success-screen__link:hover .success-screen__link-arrow {
  transform: translateX(4px);
  color: #94a3b8;
}

/* Back Link */
.success-screen__back {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-8);
  font-size: var(--text-sm);
  color: #64748b;
  text-decoration: none;
  transition: color var(--transition-fast);
}

.success-screen__back:hover {
  color: var(--color-accent-hover);
}

/* Responsive */
@media (max-width: 767px) {
  .success-screen__map {
    width: 140%;
    height: 140%;
  }
}

@media (max-width: 359px) {
  .success-screen__map {
    width: 180%;
    height: 180%;
  }

  .success-screen__title {
    font-size: var(--text-2xl);
  }

  .success-screen__subtitle {
    font-size: var(--text-base);
  }
}
</style>
