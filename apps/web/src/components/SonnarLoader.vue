<template>
  <div class="sonnar-loader" :class="[`sonnar-loader--${size}`, { 'sonnar-loader--branded': showBrand }]">
    <!-- Ambient particles -->
    <div class="sonnar-loader__particles">
      <span v-for="n in particleCount" :key="n" class="sonnar-loader__particle" :style="getParticleStyle(n)" />
    </div>

    <!-- Outer glow field -->
    <div class="sonnar-loader__field">
      <div class="sonnar-loader__field-inner"></div>
    </div>

    <!-- Scan line effect -->
    <div class="sonnar-loader__scan"></div>

    <!-- Wave rings with gradient trails -->
    <div class="sonnar-loader__waves">
      <div class="sonnar-loader__wave sonnar-loader__wave--1">
        <div class="sonnar-loader__wave-trail"></div>
      </div>
      <div class="sonnar-loader__wave sonnar-loader__wave--2">
        <div class="sonnar-loader__wave-trail"></div>
      </div>
      <div class="sonnar-loader__wave sonnar-loader__wave--3" v-if="size !== 'sm'">
        <div class="sonnar-loader__wave-trail"></div>
      </div>
      <div class="sonnar-loader__wave sonnar-loader__wave--4" v-if="size === 'lg'">
        <div class="sonnar-loader__wave-trail"></div>
      </div>
    </div>

    <!-- Center element with pulsing core -->
    <div class="sonnar-loader__center">
      <div class="sonnar-loader__core">
        <div class="sonnar-loader__core-glow"></div>
        <div class="sonnar-loader__core-ring"></div>
        <span v-if="showBrand" class="sonnar-loader__brand">S</span>
        <div v-else class="sonnar-loader__dot">
          <div class="sonnar-loader__dot-pulse"></div>
          <div class="sonnar-loader__dot-inner"></div>
        </div>
      </div>
    </div>

    <!-- Detection sparks (random glints) -->
    <div class="sonnar-loader__sparks" v-if="size !== 'sm'">
      <span v-for="n in 3" :key="'spark-'+n" class="sonnar-loader__spark" :style="getSparkStyle(n)" />
    </div>

    <p v-if="text" class="sonnar-loader__text">
      <span class="sonnar-loader__text-content">{{ text }}</span>
      <span class="sonnar-loader__text-dots">
        <span>.</span><span>.</span><span>.</span>
      </span>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  size?: 'sm' | 'md' | 'lg'
  showBrand?: boolean
  text?: string
}>(), {
  size: 'md',
  showBrand: false,
  text: ''
})

const particleCount = computed(() => {
  switch (props.size) {
    case 'sm': return 4
    case 'md': return 6
    case 'lg': return 8
    default: return 6
  }
})

const getParticleStyle = (index: number) => {
  const angle = (index / particleCount.value) * 360
  const delay = (index / particleCount.value) * 3
  const distance = 30 + (index % 3) * 15
  return {
    '--particle-angle': `${angle}deg`,
    '--particle-delay': `${delay}s`,
    '--particle-distance': `${distance}px`
  }
}

const getSparkStyle = (index: number) => {
  const angles = [45, 135, 270]
  const delays = [0.5, 1.8, 3.2]
  return {
    '--spark-angle': `${angles[index - 1]}deg`,
    '--spark-delay': `${delays[index - 1]}s`
  }
}
</script>

<style scoped>
.sonnar-loader {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-4, 16px);
  --loader-primary: 37, 99, 235;
  --loader-secondary: 59, 130, 246;
  --loader-accent: 96, 165, 250;
}

/* ===== PARTICLES ===== */
.sonnar-loader__particles {
  position: absolute;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.sonnar-loader__particle {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 3px;
  height: 3px;
  background: rgba(var(--loader-accent), 0.6);
  border-radius: 50%;
  transform: rotate(var(--particle-angle)) translateX(var(--particle-distance));
  animation: particleFloat 3s ease-in-out infinite;
  animation-delay: var(--particle-delay);
  box-shadow: 0 0 6px rgba(var(--loader-accent), 0.4);
}

@keyframes particleFloat {
  0%, 100% {
    opacity: 0;
    transform: rotate(var(--particle-angle)) translateX(var(--particle-distance)) scale(0.5);
  }
  20% {
    opacity: 0.8;
    transform: rotate(var(--particle-angle)) translateX(calc(var(--particle-distance) + 10px)) scale(1);
  }
  80% {
    opacity: 0.4;
    transform: rotate(calc(var(--particle-angle) + 20deg)) translateX(calc(var(--particle-distance) + 20px)) scale(0.8);
  }
}

/* ===== AMBIENT FIELD ===== */
.sonnar-loader__field {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  animation: fieldPulse 6s cubic-bezier(0.45, 0, 0.55, 1) infinite;
}

.sonnar-loader__field-inner {
  position: absolute;
  inset: 15%;
  border-radius: 50%;
  animation: fieldInnerPulse 4s cubic-bezier(0.45, 0, 0.55, 1) infinite;
}

.sonnar-loader--sm .sonnar-loader__field {
  width: 100px;
  height: 100px;
  background: radial-gradient(
    circle,
    rgba(var(--loader-primary), 0.08) 0%,
    rgba(var(--loader-primary), 0.03) 40%,
    transparent 70%
  );
}

.sonnar-loader--md .sonnar-loader__field {
  width: 160px;
  height: 160px;
  background: radial-gradient(
    circle,
    rgba(var(--loader-primary), 0.1) 0%,
    rgba(var(--loader-primary), 0.04) 40%,
    transparent 70%
  );
}

.sonnar-loader--lg .sonnar-loader__field {
  width: 220px;
  height: 220px;
  background: radial-gradient(
    circle,
    rgba(var(--loader-primary), 0.12) 0%,
    rgba(var(--loader-primary), 0.05) 40%,
    transparent 70%
  );
}

.sonnar-loader__field-inner {
  background: radial-gradient(
    circle,
    rgba(var(--loader-secondary), 0.15) 0%,
    transparent 70%
  );
}

@keyframes fieldPulse {
  0%, 100% {
    opacity: 0.5;
    transform: scale(0.92);
  }
  50% {
    opacity: 1;
    transform: scale(1.08);
  }
}

@keyframes fieldInnerPulse {
  0%, 100% {
    opacity: 0.3;
    transform: scale(0.95);
  }
  50% {
    opacity: 0.8;
    transform: scale(1.05);
  }
}

/* ===== SCAN LINE ===== */
.sonnar-loader__scan {
  position: absolute;
  border-radius: 50%;
  overflow: hidden;
  pointer-events: none;
}

.sonnar-loader--sm .sonnar-loader__scan {
  width: 50px;
  height: 50px;
}

.sonnar-loader--md .sonnar-loader__scan {
  width: 80px;
  height: 80px;
}

.sonnar-loader--lg .sonnar-loader__scan {
  width: 110px;
  height: 110px;
}

.sonnar-loader__scan::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 100%;
  height: 2px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(var(--loader-accent), 0.3) 20%,
    rgba(var(--loader-accent), 0.8) 50%,
    rgba(var(--loader-accent), 0.3) 80%,
    transparent 100%
  );
  transform-origin: left center;
  animation: scanRotate 3s linear infinite;
}

@keyframes scanRotate {
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to { transform: translate(-50%, -50%) rotate(360deg); }
}

/* ===== WAVES ===== */
.sonnar-loader__waves {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sonnar-loader--sm .sonnar-loader__waves {
  width: 44px;
  height: 44px;
}

.sonnar-loader--md .sonnar-loader__waves {
  width: 64px;
  height: 64px;
}

.sonnar-loader--lg .sonnar-loader__waves {
  width: 90px;
  height: 90px;
}

.sonnar-loader__wave {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  opacity: 0;
  border: 1.5px solid transparent;
  background: linear-gradient(135deg, rgba(var(--loader-accent), 0.4), rgba(var(--loader-primary), 0.2)) border-box;
  -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  animation: waveExpand 3.6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

.sonnar-loader__wave-trail {
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    transparent 0deg,
    rgba(var(--loader-accent), 0.15) 60deg,
    transparent 120deg
  );
  animation: waveTrailRotate 3.6s linear infinite;
  opacity: 0;
}

.sonnar-loader__wave--1 { animation-delay: 0s; }
.sonnar-loader__wave--1 .sonnar-loader__wave-trail { animation-delay: 0s; }

.sonnar-loader__wave--2 { animation-delay: 0.9s; }
.sonnar-loader__wave--2 .sonnar-loader__wave-trail { animation-delay: 0.9s; }

.sonnar-loader__wave--3 { animation-delay: 1.8s; }
.sonnar-loader__wave--3 .sonnar-loader__wave-trail { animation-delay: 1.8s; }

.sonnar-loader__wave--4 { animation-delay: 2.7s; }
.sonnar-loader__wave--4 .sonnar-loader__wave-trail { animation-delay: 2.7s; }

@keyframes waveExpand {
  0% {
    transform: scale(0.35);
    opacity: 0;
  }
  15% {
    opacity: 0.7;
  }
  50% {
    opacity: 0.35;
  }
  100% {
    transform: scale(2.2);
    opacity: 0;
  }
}

@keyframes waveTrailRotate {
  0% {
    transform: rotate(0deg);
    opacity: 0;
  }
  15% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
  100% {
    transform: rotate(180deg);
    opacity: 0;
  }
}

/* ===== CENTER CORE ===== */
.sonnar-loader__center {
  position: absolute;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sonnar-loader__core {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sonnar-loader__core-glow {
  position: absolute;
  border-radius: 50%;
  animation: coreGlow 2s ease-in-out infinite;
}

.sonnar-loader--sm .sonnar-loader__core-glow {
  width: 24px;
  height: 24px;
  background: radial-gradient(circle, rgba(var(--loader-accent), 0.4) 0%, transparent 70%);
  filter: blur(4px);
}

.sonnar-loader--md .sonnar-loader__core-glow {
  width: 32px;
  height: 32px;
  background: radial-gradient(circle, rgba(var(--loader-accent), 0.5) 0%, transparent 70%);
  filter: blur(6px);
}

.sonnar-loader--lg .sonnar-loader__core-glow {
  width: 44px;
  height: 44px;
  background: radial-gradient(circle, rgba(var(--loader-accent), 0.6) 0%, transparent 70%);
  filter: blur(8px);
}

@keyframes coreGlow {
  0%, 100% {
    opacity: 0.6;
    transform: scale(0.9);
  }
  50% {
    opacity: 1;
    transform: scale(1.2);
  }
}

.sonnar-loader__core-ring {
  position: absolute;
  border-radius: 50%;
  border: 1px solid rgba(var(--loader-accent), 0.3);
  animation: coreRingPulse 2s ease-in-out infinite;
}

.sonnar-loader--sm .sonnar-loader__core-ring {
  width: 20px;
  height: 20px;
}

.sonnar-loader--md .sonnar-loader__core-ring {
  width: 26px;
  height: 26px;
}

.sonnar-loader--lg .sonnar-loader__core-ring {
  width: 34px;
  height: 34px;
}

@keyframes coreRingPulse {
  0%, 100% {
    opacity: 0.5;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.1);
  }
}

/* Dot styling */
.sonnar-loader__dot {
  position: relative;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sonnar-loader--sm .sonnar-loader__dot {
  width: 10px;
  height: 10px;
}

.sonnar-loader--md .sonnar-loader__dot {
  width: 14px;
  height: 14px;
}

.sonnar-loader--lg .sonnar-loader__dot {
  width: 18px;
  height: 18px;
}

.sonnar-loader__dot-pulse {
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  background: rgba(var(--loader-secondary), 0.3);
  animation: dotPulse 1.5s ease-out infinite;
}

@keyframes dotPulse {
  0% {
    transform: scale(0.8);
    opacity: 0.6;
  }
  50% {
    transform: scale(1.4);
    opacity: 0;
  }
  100% {
    transform: scale(0.8);
    opacity: 0;
  }
}

.sonnar-loader__dot-inner {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: linear-gradient(
    135deg,
    rgba(var(--loader-accent), 1) 0%,
    rgba(var(--loader-secondary), 1) 50%,
    rgba(var(--loader-primary), 1) 100%
  );
  box-shadow:
    0 0 16px rgba(var(--loader-secondary), 0.4),
    0 0 6px rgba(var(--loader-accent), 0.6),
    inset 0 1px 3px rgba(255, 255, 255, 0.25),
    inset 0 -1px 2px rgba(0, 0, 0, 0.1);
  animation: dotBreath 2s cubic-bezier(0.45, 0, 0.55, 1) infinite;
}

@keyframes dotBreath {
  0%, 100% {
    transform: scale(1);
    box-shadow:
      0 0 12px rgba(var(--loader-secondary), 0.3),
      0 0 4px rgba(var(--loader-accent), 0.5),
      inset 0 1px 3px rgba(255, 255, 255, 0.25);
  }
  50% {
    transform: scale(1.05);
    box-shadow:
      0 0 20px rgba(var(--loader-secondary), 0.5),
      0 0 8px rgba(var(--loader-accent), 0.7),
      inset 0 1px 3px rgba(255, 255, 255, 0.3);
  }
}

/* Brand letter */
.sonnar-loader__brand {
  font-weight: 700;
  letter-spacing: -0.03em;
  background: linear-gradient(
    135deg,
    rgba(var(--loader-accent), 1) 0%,
    rgba(var(--loader-secondary), 1) 50%,
    rgba(var(--loader-primary), 1) 100%
  );
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: brandPulse 2s cubic-bezier(0.45, 0, 0.55, 1) infinite;
  filter: drop-shadow(0 0 10px rgba(var(--loader-secondary), 0.3));
}

.sonnar-loader--sm .sonnar-loader__brand {
  font-size: 16px;
}

.sonnar-loader--md .sonnar-loader__brand {
  font-size: 20px;
}

.sonnar-loader--lg .sonnar-loader__brand {
  font-size: 28px;
}

@keyframes brandPulse {
  0%, 100% {
    opacity: 0.85;
    transform: scale(1);
    filter: drop-shadow(0 0 8px rgba(var(--loader-secondary), 0.2));
  }
  50% {
    opacity: 1;
    transform: scale(1.05);
    filter: drop-shadow(0 0 14px rgba(var(--loader-secondary), 0.4));
  }
}

/* ===== SPARKS ===== */
.sonnar-loader__sparks {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.sonnar-loader__spark {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 2px;
  height: 2px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 50%;
  transform: rotate(var(--spark-angle)) translateX(35px);
  animation: sparkFlash 4s ease-in-out infinite;
  animation-delay: var(--spark-delay);
  box-shadow: 0 0 4px rgba(255, 255, 255, 0.8), 0 0 8px rgba(var(--loader-accent), 0.6);
}

@keyframes sparkFlash {
  0%, 90%, 100% {
    opacity: 0;
    transform: rotate(var(--spark-angle)) translateX(35px) scale(0);
  }
  5% {
    opacity: 1;
    transform: rotate(var(--spark-angle)) translateX(35px) scale(1.5);
  }
  10% {
    opacity: 0.5;
    transform: rotate(calc(var(--spark-angle) + 5deg)) translateX(40px) scale(0.8);
  }
}

/* ===== TEXT ===== */
.sonnar-loader__text {
  font-size: var(--text-sm, 14px);
  font-weight: var(--font-medium, 500);
  color: var(--color-text-muted, #64748b);
  margin: 0;
  letter-spacing: 0.02em;
  display: flex;
  align-items: center;
  gap: 2px;
}

.sonnar-loader__text-content {
  animation: textFade 2s ease-in-out infinite;
}

.sonnar-loader__text-dots {
  display: inline-flex;
}

.sonnar-loader__text-dots span {
  animation: dotFade 1.4s ease-in-out infinite;
}

.sonnar-loader__text-dots span:nth-child(1) { animation-delay: 0s; }
.sonnar-loader__text-dots span:nth-child(2) { animation-delay: 0.2s; }
.sonnar-loader__text-dots span:nth-child(3) { animation-delay: 0.4s; }

@keyframes textFade {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 0.9; }
}

@keyframes dotFade {
  0%, 60%, 100% { opacity: 0.3; }
  30% { opacity: 1; }
}

/* ===== DARK MODE ===== */
[data-theme="dark"] .sonnar-loader {
  --loader-primary: 59, 130, 246;
  --loader-secondary: 96, 165, 250;
  --loader-accent: 147, 197, 253;
}

[data-theme="dark"] .sonnar-loader__field {
  background: radial-gradient(
    circle,
    rgba(var(--loader-primary), 0.15) 0%,
    rgba(var(--loader-primary), 0.05) 40%,
    transparent 70%
  );
}

[data-theme="dark"] .sonnar-loader__wave {
  background: linear-gradient(135deg, rgba(var(--loader-accent), 0.5), rgba(var(--loader-primary), 0.3)) border-box;
}

[data-theme="dark"] .sonnar-loader__dot-inner {
  box-shadow:
    0 0 20px rgba(var(--loader-secondary), 0.5),
    0 0 8px rgba(var(--loader-accent), 0.7),
    inset 0 1px 3px rgba(255, 255, 255, 0.15);
}

/* ===== REDUCED MOTION ===== */
@media (prefers-reduced-motion: reduce) {
  .sonnar-loader__particle,
  .sonnar-loader__field,
  .sonnar-loader__field-inner,
  .sonnar-loader__scan::before,
  .sonnar-loader__wave,
  .sonnar-loader__wave-trail,
  .sonnar-loader__core-glow,
  .sonnar-loader__core-ring,
  .sonnar-loader__dot-pulse,
  .sonnar-loader__dot-inner,
  .sonnar-loader__brand,
  .sonnar-loader__spark,
  .sonnar-loader__text-content,
  .sonnar-loader__text-dots span {
    animation: none;
  }

  .sonnar-loader__wave {
    opacity: 0.2;
    transform: scale(1);
  }

  .sonnar-loader__wave--2 { transform: scale(1.4); opacity: 0.15; }
  .sonnar-loader__wave--3 { transform: scale(1.8); opacity: 0.1; }
  .sonnar-loader__wave--4 { transform: scale(2.2); opacity: 0.05; }

  .sonnar-loader__dot-inner { opacity: 1; }
  .sonnar-loader__text-content { opacity: 0.7; }
  .sonnar-loader__field { opacity: 0.7; }
  .sonnar-loader__core-glow { opacity: 0.8; }
}
</style>
