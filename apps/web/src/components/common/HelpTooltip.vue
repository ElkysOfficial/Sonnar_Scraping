<template>
  <span
    ref="anchor"
    class="help-tooltip-anchor"
    tabindex="0"
    role="button"
    :aria-label="text"
    @mouseenter="open"
    @mouseleave="close"
    @focus="open"
    @blur="close"
    @keydown.escape="close"
  >
    <slot>
      <span class="help-tooltip-icon">?</span>
    </slot>
    <Teleport to="body">
      <span
        v-if="visible"
        class="help-tooltip-balloon"
        :class="`help-tooltip-balloon--${placement}`"
        :style="balloonStyle"
        role="tooltip"
      >
        <span class="help-tooltip-arrow" :style="arrowStyle"></span>
        {{ text }}
      </span>
    </Teleport>
  </span>
</template>

<script setup>
import { ref, nextTick } from 'vue'

defineProps({
  text: { type: String, required: true },
})

const visible = ref(false)
const anchor = ref(null)
const balloonStyle = ref({})
const arrowStyle = ref({})
const placement = ref('above')

const TOOLTIP_MAX_WIDTH = 280
const VIEWPORT_MARGIN = 8

async function open () {
  visible.value = true
  await nextTick()
  position()
}

function close () {
  visible.value = false
}

function position () {
  if (!anchor.value) return
  const rect = anchor.value.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  const balloonWidth = Math.min(TOOLTIP_MAX_WIDTH, vw - VIEWPORT_MARGIN * 2)

  // Centro horizontal do anchor
  const anchorCenterX = rect.left + rect.width / 2
  let left = anchorCenterX - balloonWidth / 2
  left = Math.max(VIEWPORT_MARGIN, Math.min(left, vw - balloonWidth - VIEWPORT_MARGIN))

  // Tenta acima; se não couber, abaixo
  const spaceAbove = rect.top
  const placeAbove = spaceAbove > 80 || rect.bottom + 80 > vh

  if (placeAbove) {
    placement.value = 'above'
    balloonStyle.value = {
      left: `${left}px`,
      top: `${rect.top - VIEWPORT_MARGIN}px`,
      transform: 'translateY(-100%)',
      maxWidth: `${balloonWidth}px`,
    }
  } else {
    placement.value = 'below'
    balloonStyle.value = {
      left: `${left}px`,
      top: `${rect.bottom + VIEWPORT_MARGIN}px`,
      maxWidth: `${balloonWidth}px`,
    }
  }

  // Posiciona a seta no centro do anchor (dentro do balão)
  const arrowLeft = anchorCenterX - left
  arrowStyle.value = { left: `${arrowLeft}px` }
}
</script>

<style scoped>
.help-tooltip-anchor {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: help;
  outline: none;
}
.help-tooltip-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px; height: 16px;
  border-radius: 50%;
  background: rgba(6, 182, 212, 0.12);
  border: 1px solid rgba(6, 182, 212, 0.4);
  color: #06b6d4;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  user-select: none;
  transition: background 150ms ease;
}
.help-tooltip-anchor:hover .help-tooltip-icon,
.help-tooltip-anchor:focus-visible .help-tooltip-icon {
  background: rgba(6, 182, 212, 0.25);
}
</style>

<style>
/* Estilos globais do balão (Teleport para body) */
.help-tooltip-balloon {
  position: fixed !important;
  z-index: 2147483647 !important;
  padding: 9px 12px;
  background: rgba(15, 23, 42, 0.97);
  color: #e2e8f0;
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 8px;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
  letter-spacing: 0;
  text-transform: none;
  text-align: left;
  white-space: normal;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
  pointer-events: none;
  isolation: isolate;
  will-change: transform, opacity;
  animation: helpTooltipFadeIn 140ms ease-out;
}
.help-tooltip-arrow {
  position: absolute;
  width: 0; height: 0;
  border: 5px solid transparent;
  transform: translateX(-50%);
}
.help-tooltip-balloon--above .help-tooltip-arrow {
  bottom: -10px;
  border-top-color: rgba(15, 23, 42, 0.97);
}
.help-tooltip-balloon--below .help-tooltip-arrow {
  top: -10px;
  border-bottom-color: rgba(15, 23, 42, 0.97);
}
@keyframes helpTooltipFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
</style>
