<template>
  <transition name="overlay-fade">
    <div v-if="visible" class="loading-overlay">
      <!-- Aurora background effect -->
      <div class="loading-overlay__aurora">
        <div class="loading-overlay__aurora-layer loading-overlay__aurora-layer--1"></div>
        <div class="loading-overlay__aurora-layer loading-overlay__aurora-layer--2"></div>
      </div>

      <!-- Floating particles -->
      <div class="loading-overlay__particles">
        <span
          v-for="n in 20"
          :key="'particle-'+n"
          class="loading-overlay__particle"
          :style="getParticleStyle(n)"
        />
      </div>

      <!-- Map Background with enhanced effects -->
      <div class="loading-overlay__map-container">
        <img
          src="/world.svg"
          alt="Mapa Mundi"
          class="loading-overlay__world-map"
        >

        <!-- Holographic grid -->
        <div class="loading-overlay__holo-grid"></div>

        <!-- Radar sweep with trail -->
        <div class="loading-overlay__radar-sweep">
          <div class="loading-overlay__radar-trail"></div>
        </div>

        <!-- Detection points -->
        <div class="loading-overlay__detections">
          <div
            v-for="point in detectionPoints"
            :key="point.id"
            class="loading-overlay__detection"
            :style="{
              top: point.top + '%',
              left: point.left + '%',
              animationDelay: point.delay + 's'
            }"
          >
            <span class="loading-overlay__detection-core"></span>
            <span class="loading-overlay__detection-ring"></span>
            <span class="loading-overlay__detection-ring loading-overlay__detection-ring--2"></span>
            <span class="loading-overlay__detection-data">{{ point.label }}</span>
          </div>
        </div>

        <!-- Pulse rings from center -->
        <div class="loading-overlay__pulse-container">
          <div class="loading-overlay__pulse loading-overlay__pulse--1"></div>
          <div class="loading-overlay__pulse loading-overlay__pulse--2"></div>
          <div class="loading-overlay__pulse loading-overlay__pulse--3"></div>
          <div class="loading-overlay__pulse loading-overlay__pulse--4"></div>
        </div>

        <!-- Connection lines -->
        <svg class="loading-overlay__connections" viewBox="0 0 100 100" preserveAspectRatio="none">
          <line
            v-for="(line, i) in connectionLines"
            :key="'line-'+i"
            :x1="line.x1"
            :y1="line.y1"
            :x2="line.x2"
            :y2="line.y2"
            class="loading-overlay__connection-line"
            :style="{ animationDelay: line.delay + 's' }"
          />
        </svg>
      </div>

      <!-- Center content -->
      <div class="loading-overlay__center">
        <!-- Main radar display -->
        <div class="loading-overlay__radar">
          <!-- Outer glow -->
          <div class="loading-overlay__radar-glow"></div>

          <!-- Concentric rings -->
          <div class="loading-overlay__radar-rings">
            <div class="loading-overlay__radar-ring"></div>
            <div class="loading-overlay__radar-ring"></div>
            <div class="loading-overlay__radar-ring"></div>
            <div class="loading-overlay__radar-ring"></div>
          </div>

          <!-- Crosshairs -->
          <div class="loading-overlay__crosshairs">
            <span></span>
            <span></span>
          </div>

          <!-- Rotating scanner -->
          <div class="loading-overlay__scanner">
            <div class="loading-overlay__scanner-beam"></div>
          </div>

          <!-- Center core -->
          <div class="loading-overlay__radar-core">
            <div class="loading-overlay__core-pulse"></div>
            <div class="loading-overlay__core-dot"></div>
          </div>

          <!-- Corner markers -->
          <div class="loading-overlay__markers">
            <span class="loading-overlay__marker loading-overlay__marker--tl"></span>
            <span class="loading-overlay__marker loading-overlay__marker--tr"></span>
            <span class="loading-overlay__marker loading-overlay__marker--bl"></span>
            <span class="loading-overlay__marker loading-overlay__marker--br"></span>
          </div>
        </div>

        <!-- Text content -->
        <div class="loading-overlay__content">
          <h2 class="loading-overlay__title">
            <span class="loading-overlay__title-text">{{ title }}</span>
            <span class="loading-overlay__title-cursor"></span>
          </h2>
          <p class="loading-overlay__subtitle">{{ subtitle }}</p>

          <!-- Progress bar -->
          <div class="loading-overlay__progress">
            <div class="loading-overlay__progress-track">
              <div class="loading-overlay__progress-fill" :style="{ width: progress + '%' }">
                <div class="loading-overlay__progress-glow"></div>
              </div>
              <div class="loading-overlay__progress-particles">
                <span v-for="n in 5" :key="'prog-particle-'+n" :style="{ left: (n * 20 - 10) + '%' }"></span>
              </div>
            </div>
            <span class="loading-overlay__progress-text">{{ Math.round(progress) }}%</span>
          </div>

          <!-- Status dots -->
          <div class="loading-overlay__status">
            <span class="loading-overlay__status-dot"></span>
            <span class="loading-overlay__status-dot"></span>
            <span class="loading-overlay__status-dot"></span>
          </div>
        </div>
      </div>

      <!-- Scan lines overlay -->
      <div class="loading-overlay__scanlines"></div>

      <!-- Vignette -->
      <div class="loading-overlay__vignette"></div>
    </div>
  </transition>
</template>

<script>
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'

export default {
  name: 'LoadingOverlay',
  props: {
    visible: {
      type: Boolean,
      default: false
    },
    title: {
      type: String,
      default: 'Escaneando'
    },
    subtitle: {
      type: String,
      default: 'Detectando conexões'
    },
    duration: {
      type: Number,
      default: 3000
    }
  },
  emits: ['complete'],
  setup(props, { emit }) {
    const progress = ref(0)
    const detectionPoints = ref([])
    const connectionLines = ref([])
    let interval = null
    let pointInterval = null
    let pointId = 0

    // Land regions for realistic detection points
    const landRegions = [
      { minLeft: 8, maxLeft: 25, minTop: 20, maxTop: 45, label: 'NA' },
      { minLeft: 15, maxLeft: 22, minTop: 42, maxTop: 52, label: 'CA' },
      { minLeft: 20, maxLeft: 35, minTop: 52, maxTop: 85, label: 'SA' },
      { minLeft: 42, maxLeft: 55, minTop: 22, maxTop: 42, label: 'EU' },
      { minLeft: 42, maxLeft: 58, minTop: 38, maxTop: 72, label: 'AF' },
      { minLeft: 55, maxLeft: 70, minTop: 22, maxTop: 50, label: 'AS' },
      { minLeft: 68, maxLeft: 85, minTop: 25, maxTop: 55, label: 'EA' },
      { minLeft: 75, maxLeft: 88, minTop: 48, maxTop: 62, label: 'SE' },
      { minLeft: 78, maxLeft: 90, minTop: 65, maxTop: 80, label: 'OC' }
    ]

    const getRandomLandPoint = () => {
      const region = landRegions[Math.floor(Math.random() * landRegions.length)]
      return {
        top: Math.random() * (region.maxTop - region.minTop) + region.minTop,
        left: Math.random() * (region.maxLeft - region.minLeft) + region.minLeft,
        label: region.label
      }
    }

    const generateRandomPoints = () => {
      const numPoints = Math.floor(Math.random() * 4) + 5
      const newPoints = []

      for (let i = 0; i < numPoints; i++) {
        const landPoint = getRandomLandPoint()
        newPoints.push({
          id: ++pointId,
          top: landPoint.top,
          left: landPoint.left,
          delay: Math.random() * 0.8,
          label: landPoint.label + '-' + Math.floor(Math.random() * 999).toString().padStart(3, '0')
        })
      }

      detectionPoints.value = newPoints

      // Generate connection lines between some points
      const lines = []
      for (let i = 0; i < Math.min(newPoints.length - 1, 4); i++) {
        const p1 = newPoints[i]
        const p2 = newPoints[i + 1]
        lines.push({
          x1: p1.left,
          y1: p1.top,
          x2: p2.left,
          y2: p2.top,
          delay: i * 0.3
        })
      }
      connectionLines.value = lines
    }

    const getParticleStyle = (index) => {
      const x = Math.random() * 100
      const y = Math.random() * 100
      const size = 1 + Math.random() * 2
      const duration = 15 + Math.random() * 20
      const delay = Math.random() * 10
      return {
        left: x + '%',
        top: y + '%',
        width: size + 'px',
        height: size + 'px',
        '--float-duration': duration + 's',
        '--float-delay': delay + 's'
      }
    }

    const startProgress = () => {
      const increment = 100 / (props.duration / 30)
      interval = setInterval(() => {
        if (progress.value < 100) {
          progress.value = Math.min(progress.value + increment, 100)
        } else {
          clearInterval(interval)
          emit('complete')
        }
      }, 30)

      generateRandomPoints()
      pointInterval = setInterval(generateRandomPoints, 4000)
    }

    const stopProgress = () => {
      if (interval) clearInterval(interval)
      if (pointInterval) clearInterval(pointInterval)
      progress.value = 0
      detectionPoints.value = []
      connectionLines.value = []
    }

    watch(() => props.visible, (newVal) => {
      if (newVal) startProgress()
      else stopProgress()
    })

    onMounted(() => {
      if (props.visible) startProgress()
    })

    onUnmounted(() => stopProgress())

    return {
      progress,
      detectionPoints,
      connectionLines,
      getParticleStyle
    }
  }
}
</script>

<style scoped>
.loading-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #020617 0%, #0f172a 50%, #1e1b4b 100%);
  overflow: hidden;
}

/* ===== AURORA BACKGROUND ===== */
.loading-overlay__aurora {
  position: absolute;
  inset: 0;
  opacity: 0.4;
  pointer-events: none;
}

.loading-overlay__aurora-layer {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 80% 50% at 50% 120%, color-mix(in srgb, var(--color-accent) 30%, transparent) 0%, transparent 50%),
              radial-gradient(ellipse 60% 40% at 20% 80%, rgba(139, 92, 246, 0.2) 0%, transparent 40%);
  animation: auroraShift 15s ease-in-out infinite;
}

.loading-overlay__aurora-layer--2 {
  background: radial-gradient(ellipse 70% 50% at 80% 90%, rgba(34, 211, 238, 0.2) 0%, transparent 45%),
              radial-gradient(ellipse 50% 30% at 60% 70%, rgba(168, 85, 247, 0.15) 0%, transparent 35%);
  animation: auroraShift 20s ease-in-out infinite reverse;
}

@keyframes auroraShift {
  0%, 100% { transform: translateY(0) scale(1); opacity: 0.4; }
  50% { transform: translateY(-5%) scale(1.05); opacity: 0.6; }
}

/* ===== FLOATING PARTICLES ===== */
.loading-overlay__particles {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.loading-overlay__particle {
  position: absolute;
  background: rgba(147, 197, 253, 0.6);
  border-radius: 50%;
  animation: particleFloat var(--float-duration) ease-in-out infinite;
  animation-delay: var(--float-delay);
  box-shadow: 0 0 6px rgba(147, 197, 253, 0.4);
}

@keyframes particleFloat {
  0%, 100% {
    transform: translateY(0) translateX(0);
    opacity: 0;
  }
  10% { opacity: 0.8; }
  50% {
    transform: translateY(-30px) translateX(10px);
    opacity: 0.4;
  }
  90% { opacity: 0.6; }
}

/* ===== MAP CONTAINER ===== */
.loading-overlay__map-container {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.loading-overlay__world-map {
  position: absolute;
  width: 90%;
  height: 90%;
  max-width: 1400px;
  object-fit: contain;
  opacity: 0.08;
  filter: brightness(0) saturate(100%) invert(50%) sepia(80%) saturate(800%) hue-rotate(190deg);
  animation: mapFloat 8s ease-in-out infinite;
}

@keyframes mapFloat {
  0%, 100% { opacity: 0.06; transform: scale(1) translateY(0); }
  50% { opacity: 0.12; transform: scale(1.02) translateY(-5px); }
}

/* ===== HOLOGRAPHIC GRID ===== */
.loading-overlay__holo-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(color-mix(in srgb, var(--color-accent) 3%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--color-accent) 3%, transparent) 1px, transparent 1px);
  background-size: 50px 50px;
  animation: gridPulse 4s ease-in-out infinite;
  mask-image: radial-gradient(ellipse 70% 50% at center, black 30%, transparent 70%);
}

@keyframes gridPulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

/* ===== RADAR SWEEP ===== */
.loading-overlay__radar-sweep {
  position: absolute;
  top: 0;
  left: -30%;
  width: 30%;
  height: 100%;
  animation: sweepMove 4s ease-in-out infinite;
}

.loading-overlay__radar-trail {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg,
    transparent 0%,
    color-mix(in srgb, var(--color-accent) 2%, transparent) 20%,
    rgba(96, 165, 250, 0.05) 50%,
    rgba(147, 197, 253, 0.12) 80%,
    rgba(191, 219, 254, 0.25) 95%,
    rgba(255, 255, 255, 0.4) 100%
  );
}

.loading-overlay__radar-sweep::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 3px;
  height: 100%;
  background: linear-gradient(180deg,
    transparent 5%,
    rgba(147, 197, 253, 0.9) 30%,
    rgba(191, 219, 254, 1) 50%,
    rgba(147, 197, 253, 0.9) 70%,
    transparent 95%
  );
  box-shadow:
    0 0 20px rgba(147, 197, 253, 0.8),
    0 0 40px rgba(96, 165, 250, 0.5),
    0 0 60px color-mix(in srgb, var(--color-accent) 30%, transparent);
}

@keyframes sweepMove {
  0% { left: -30%; opacity: 0; }
  5% { opacity: 1; }
  95% { opacity: 1; }
  100% { left: 100%; opacity: 0; }
}

/* ===== DETECTION POINTS ===== */
.loading-overlay__detections {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.loading-overlay__detection {
  position: absolute;
  width: 16px;
  height: 16px;
  transform: translate(-50%, -50%);
  animation: detectionAppear 4s ease-out forwards;
}

.loading-overlay__detection-core {
  position: absolute;
  inset: 4px;
  background: radial-gradient(circle, var(--color-accent-hover) 0%, var(--color-accent) 60%, transparent 100%);
  border-radius: 50%;
  animation: coreGlow 2s ease-in-out infinite;
  box-shadow: 0 0 8px rgba(96, 165, 250, 0.8);
}

.loading-overlay__detection-ring {
  position: absolute;
  inset: 0;
  border: 1.5px solid rgba(96, 165, 250, 0.8);
  border-radius: 50%;
  animation: ringExpand 2s ease-out infinite;
}

.loading-overlay__detection-ring--2 {
  animation-delay: 0.5s;
}

.loading-overlay__detection-data {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  font-size: 8px;
  font-family: 'Courier New', monospace;
  color: rgba(147, 197, 253, 0.9);
  white-space: nowrap;
  letter-spacing: 0.5px;
  text-shadow: 0 0 4px rgba(96, 165, 250, 0.5);
  animation: dataFlicker 3s ease-in-out infinite;
  margin-top: 4px;
}

@keyframes detectionAppear {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0); }
  15% { opacity: 1; transform: translate(-50%, -50%) scale(1.3); }
  25% { transform: translate(-50%, -50%) scale(1); }
  85% { opacity: 0.9; }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
}

@keyframes coreGlow {
  0%, 100% { opacity: 0.8; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.2); }
}

@keyframes ringExpand {
  0% { transform: scale(0.5); opacity: 1; }
  100% { transform: scale(3); opacity: 0; }
}

@keyframes dataFlicker {
  0%, 95%, 100% { opacity: 0.9; }
  97% { opacity: 0.3; }
}

/* ===== CONNECTION LINES ===== */
.loading-overlay__connections {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.loading-overlay__connection-line {
  stroke: rgba(96, 165, 250, 0.4);
  stroke-width: 0.3;
  stroke-dasharray: 4 2;
  animation: lineDraw 3s ease-out forwards;
}

@keyframes lineDraw {
  0% { stroke-dashoffset: 100; opacity: 0; }
  20% { opacity: 1; }
  80% { opacity: 0.6; }
  100% { stroke-dashoffset: 0; opacity: 0; }
}

/* ===== PULSE RINGS ===== */
.loading-overlay__pulse-container {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 120vmax;
  height: 120vmax;
}

.loading-overlay__pulse {
  position: absolute;
  inset: 0;
  border: 1px solid color-mix(in srgb, var(--color-accent) 18%, transparent);
  border-radius: 50%;
  animation: pulseExpand 10s ease-out infinite;
}

.loading-overlay__pulse--1 { animation-delay: 0s; }
.loading-overlay__pulse--2 { animation-delay: 2.5s; }
.loading-overlay__pulse--3 { animation-delay: 5s; }
.loading-overlay__pulse--4 { animation-delay: 7.5s; }

@keyframes pulseExpand {
  0% { transform: scale(0); opacity: 0.6; }
  100% { transform: scale(1); opacity: 0; }
}

/* ===== CENTER RADAR ===== */
.loading-overlay__center {
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 32px;
}

.loading-overlay__radar {
  position: relative;
  width: 160px;
  height: 160px;
}

.loading-overlay__radar-glow {
  position: absolute;
  inset: -20px;
  background: radial-gradient(circle, color-mix(in srgb, var(--color-accent) 18%, transparent) 0%, transparent 70%);
  animation: radarGlow 3s ease-in-out infinite;
}

@keyframes radarGlow {
  0%, 100% { opacity: 0.5; transform: scale(0.95); }
  50% { opacity: 1; transform: scale(1.05); }
}

.loading-overlay__radar-rings {
  position: absolute;
  inset: 0;
}

.loading-overlay__radar-ring {
  position: absolute;
  border: 1px solid rgba(96, 165, 250, 0.25);
  border-radius: 50%;
}

.loading-overlay__radar-ring:nth-child(1) { inset: 0; }
.loading-overlay__radar-ring:nth-child(2) { inset: 20%; }
.loading-overlay__radar-ring:nth-child(3) { inset: 40%; }
.loading-overlay__radar-ring:nth-child(4) { inset: 60%; }

/* ===== CROSSHAIRS ===== */
.loading-overlay__crosshairs {
  position: absolute;
  inset: 0;
}

.loading-overlay__crosshairs span {
  position: absolute;
  background: rgba(96, 165, 250, 0.2);
}

.loading-overlay__crosshairs span:first-child {
  top: 50%;
  left: 10%;
  right: 10%;
  height: 1px;
  transform: translateY(-50%);
}

.loading-overlay__crosshairs span:last-child {
  left: 50%;
  top: 10%;
  bottom: 10%;
  width: 1px;
  transform: translateX(-50%);
}

/* ===== SCANNER ===== */
.loading-overlay__scanner {
  position: absolute;
  inset: 0;
  animation: scannerRotate 2.5s linear infinite;
}

.loading-overlay__scanner-beam {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 50%;
  height: 50%;
  background: conic-gradient(
    from 0deg at 0% 0%,
    transparent 0deg,
    rgba(96, 165, 250, 0.4) 30deg,
    rgba(147, 197, 253, 0.2) 60deg,
    transparent 90deg
  );
  transform-origin: top left;
  border-radius: 0 0 100% 0;
  filter: blur(2px);
}

@keyframes scannerRotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ===== RADAR CORE ===== */
.loading-overlay__radar-core {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 20px;
  height: 20px;
}

.loading-overlay__core-pulse {
  position: absolute;
  inset: -8px;
  background: rgba(96, 165, 250, 0.3);
  border-radius: 50%;
  animation: corePulse 1.5s ease-out infinite;
}

.loading-overlay__core-dot {
  position: absolute;
  inset: 2px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 40%, transparent) 0%, var(--color-accent-hover) 50%, var(--color-accent) 100%);
  border-radius: 50%;
  box-shadow:
    0 0 12px rgba(96, 165, 250, 0.8),
    0 0 24px color-mix(in srgb, var(--color-accent) 8%, transparent),
    inset 0 1px 2px rgba(255, 255, 255, 0.3);
}

@keyframes corePulse {
  0% { transform: scale(0.5); opacity: 1; }
  100% { transform: scale(2.5); opacity: 0; }
}

/* ===== CORNER MARKERS ===== */
.loading-overlay__markers {
  position: absolute;
  inset: 0;
}

.loading-overlay__marker {
  position: absolute;
  width: 12px;
  height: 12px;
}

.loading-overlay__marker::before,
.loading-overlay__marker::after {
  content: '';
  position: absolute;
  background: rgba(147, 197, 253, 0.6);
}

.loading-overlay__marker::before { width: 100%; height: 2px; }
.loading-overlay__marker::after { width: 2px; height: 100%; }

.loading-overlay__marker--tl { top: 0; left: 0; }
.loading-overlay__marker--tr { top: 0; right: 0; }
.loading-overlay__marker--tr::before { right: 0; }
.loading-overlay__marker--tr::after { right: 0; }
.loading-overlay__marker--bl { bottom: 0; left: 0; }
.loading-overlay__marker--bl::before { bottom: 0; }
.loading-overlay__marker--bl::after { bottom: 0; }
.loading-overlay__marker--br { bottom: 0; right: 0; }
.loading-overlay__marker--br::before { right: 0; bottom: 0; }
.loading-overlay__marker--br::after { right: 0; bottom: 0; }

/* ===== TEXT CONTENT ===== */
.loading-overlay__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.loading-overlay__title {
  display: flex;
  align-items: center;
  gap: 2px;
  margin: 0;
}

.loading-overlay__title-text {
  font-size: 1.75rem;
  font-weight: 600;
  color: #f1f5f9;
  letter-spacing: 0.05em;
  text-shadow: 0 0 30px rgba(96, 165, 250, 0.5);
}

.loading-overlay__title-cursor {
  width: 3px;
  height: 1.5em;
  background: rgba(147, 197, 253, 0.8);
  animation: cursorBlink 1s step-end infinite;
}

@keyframes cursorBlink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.loading-overlay__subtitle {
  font-size: 0.9rem;
  color: #94a3b8;
  margin: 0;
  letter-spacing: 0.02em;
}

/* ===== PROGRESS BAR ===== */
.loading-overlay__progress {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 200px;
}

.loading-overlay__progress-track {
  position: relative;
  flex: 1;
  height: 4px;
  background: rgba(30, 41, 59, 0.8);
  border-radius: 2px;
  overflow: hidden;
}

.loading-overlay__progress-fill {
  position: relative;
  height: 100%;
  background: linear-gradient(90deg, var(--color-accent) 0%, var(--color-accent-hover) 50%, color-mix(in srgb, var(--color-accent) 40%, transparent) 100%);
  border-radius: 2px;
  transition: width 0.1s ease-out;
}

.loading-overlay__progress-glow {
  position: absolute;
  top: -4px;
  right: 0;
  bottom: -4px;
  width: 20px;
  background: linear-gradient(90deg, transparent, rgba(147, 197, 253, 0.8));
  filter: blur(4px);
}

.loading-overlay__progress-particles {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.loading-overlay__progress-particles span {
  position: absolute;
  top: 50%;
  width: 2px;
  height: 2px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 50%;
  transform: translateY(-50%);
  animation: progressParticle 2s ease-out infinite;
}

@keyframes progressParticle {
  0%, 80%, 100% { opacity: 0; transform: translateY(-50%) scale(0); }
  10% { opacity: 1; transform: translateY(-50%) scale(1); }
  40% { opacity: 0.5; transform: translateY(-300%) scale(0.5); }
}

.loading-overlay__progress-text {
  font-size: 0.75rem;
  font-family: 'Courier New', monospace;
  color: rgba(147, 197, 253, 0.9);
  min-width: 32px;
  text-align: right;
}

/* ===== STATUS DOTS ===== */
.loading-overlay__status {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.loading-overlay__status-dot {
  width: 6px;
  height: 6px;
  background: var(--color-accent);
  border-radius: 50%;
  animation: statusPulse 1.2s ease-in-out infinite;
}

.loading-overlay__status-dot:nth-child(1) { animation-delay: 0s; }
.loading-overlay__status-dot:nth-child(2) { animation-delay: 0.15s; }
.loading-overlay__status-dot:nth-child(3) { animation-delay: 0.3s; }

@keyframes statusPulse {
  0%, 60%, 100% { transform: scale(0.8); opacity: 0.4; }
  30% { transform: scale(1.2); opacity: 1; }
}

/* ===== SCANLINES OVERLAY ===== */
.loading-overlay__scanlines {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent 0px,
    transparent 2px,
    rgba(0, 0, 0, 0.03) 2px,
    rgba(0, 0, 0, 0.03) 4px
  );
  pointer-events: none;
}

/* ===== VIGNETTE ===== */
.loading-overlay__vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, transparent 40%, rgba(0, 0, 0, 0.4) 100%);
  pointer-events: none;
}

/* ===== TRANSITIONS ===== */
.overlay-fade-enter-active {
  transition: opacity 0.5s ease-out;
}

.overlay-fade-leave-active {
  transition: opacity 0.4s ease-in;
}

.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}

/* ===== RESPONSIVE ===== */
@media (max-width: 767px) {
  .loading-overlay__radar {
    width: 120px;
    height: 120px;
  }

  .loading-overlay__title-text {
    font-size: 1.4rem;
  }

  .loading-overlay__progress {
    width: 160px;
  }
}

@media (max-width: 359px) {
  .loading-overlay__radar {
    width: 100px;
    height: 100px;
  }

  .loading-overlay__title-text {
    font-size: 1.2rem;
  }

  .loading-overlay__subtitle {
    font-size: 0.8rem;
  }
}

/* ===== REDUCED MOTION ===== */
@media (prefers-reduced-motion: reduce) {
  .loading-overlay__aurora-layer,
  .loading-overlay__particle,
  .loading-overlay__world-map,
  .loading-overlay__holo-grid,
  .loading-overlay__radar-sweep,
  .loading-overlay__detection,
  .loading-overlay__detection-core,
  .loading-overlay__detection-ring,
  .loading-overlay__detection-data,
  .loading-overlay__connection-line,
  .loading-overlay__pulse,
  .loading-overlay__radar-glow,
  .loading-overlay__scanner,
  .loading-overlay__core-pulse,
  .loading-overlay__title-cursor,
  .loading-overlay__progress-particles span,
  .loading-overlay__status-dot {
    animation: none;
  }

  .loading-overlay__world-map { opacity: 0.1; }
  .loading-overlay__radar-glow { opacity: 0.8; }
  .loading-overlay__detection { opacity: 0.8; }
  .loading-overlay__title-cursor { opacity: 1; }
  .loading-overlay__status-dot { opacity: 0.8; }
}
</style>
