<template>
  <div class="cpi" :class="{ 'cpi--open': open, 'cpi--invalid': invalid }">
    <button
      type="button"
      class="cpi-trigger"
      :aria-expanded="open"
      :aria-label="`País: ${selected.name}, código ${selected.dial}`"
      :disabled="disabled"
      @click="toggle"
    >
      <img
        :src="flagSrc(selected.iso)"
        :srcset="flagSrcset(selected.iso)"
        :alt="selected.name"
        class="cpi-flag"
        loading="eager"
        width="20"
        height="15"
      />
      <span class="cpi-name">{{ selected.name }}</span>
      <span class="cpi-dial">{{ selected.dial }}</span>
      <svg class="cpi-caret" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 6L8 10L12 6" />
      </svg>
    </button>

    <input
      ref="numberInput"
      :value="numberDisplay"
      type="tel"
      class="cpi-number"
      :placeholder="placeholder"
      autocomplete="tel-national"
      inputmode="tel"
      :disabled="disabled"
      :required="required"
      :aria-invalid="invalid || undefined"
      @input="onInput"
    />

    <Teleport to="body">
      <div v-if="open" class="cpi-pop" role="listbox" :aria-label="'Selecionar país'">
        <div class="cpi-pop-bg" @click="close"></div>
        <div class="cpi-pop-card" :style="popStyle">
          <input
            ref="searchInput"
            v-model="search"
            type="text"
            class="cpi-search"
            placeholder="Buscar país…"
            @keydown.esc="close"
          />
          <ul class="cpi-list">
            <li
              v-for="c in filtered"
              :key="c.iso"
              role="option"
              :aria-selected="c.iso === selected.iso"
              :class="['cpi-item', { 'cpi-item--active': c.iso === selected.iso }]"
              @click="pick(c)"
            >
              <img
                :src="flagSrc(c.iso)"
                :srcset="flagSrcset(c.iso)"
                :alt="c.name"
                class="cpi-flag"
                loading="lazy"
                width="20"
                height="15"
              />
              <span class="cpi-item-name">{{ c.name }}</span>
              <span class="cpi-item-dial">{{ c.dial }}</span>
            </li>
            <li v-if="filtered.length === 0" class="cpi-empty">
              Nenhum país encontrado
            </li>
          </ul>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'

interface Country {
  iso: string
  name: string
  dial: string         // ex: "+55"
  mask?: (digits: string) => string
}

// PNG hospedado no flagcdn.com — funciona em qualquer SO (Windows nao
// renderiza flag emoji nativamente).
function flagSrc(iso: string): string {
  return `https://flagcdn.com/w40/${iso.toLowerCase()}.png`
}
function flagSrcset(iso: string): string {
  const code = iso.toLowerCase()
  return `https://flagcdn.com/w40/${code}.png 1x, https://flagcdn.com/w80/${code}.png 2x`
}

// ===== Máscaras locais =====
function maskBrazil(d: string): string {
  if (!d) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`
}

function maskUS(d: string): string {
  if (!d) return ''
  if (d.length <= 3) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`
}

function maskGeneric(d: string): string {
  // Sem máscara: agrupa de 3 em 3 com espaços
  return d.replace(/(\d{3})(?=\d)/g, '$1 ').trim()
}

// ===== Lista curada (BR/LATAM/EU/US/remoto) =====
const COUNTRIES: Country[] = [
  { iso: 'BR', name: 'Brasil',          dial: '+55',  mask: maskBrazil },
  { iso: 'US', name: 'Estados Unidos',  dial: '+1',   mask: maskUS },
  { iso: 'CA', name: 'Canadá',          dial: '+1',   mask: maskUS },
  { iso: 'PT', name: 'Portugal',        dial: '+351' },
  { iso: 'ES', name: 'Espanha',         dial: '+34' },
  { iso: 'GB', name: 'Reino Unido',     dial: '+44' },
  { iso: 'IE', name: 'Irlanda',         dial: '+353' },
  { iso: 'DE', name: 'Alemanha',        dial: '+49' },
  { iso: 'FR', name: 'França',          dial: '+33' },
  { iso: 'IT', name: 'Itália',          dial: '+39' },
  { iso: 'NL', name: 'Países Baixos',   dial: '+31' },
  { iso: 'CH', name: 'Suíça',           dial: '+41' },
  { iso: 'AR', name: 'Argentina',       dial: '+54' },
  { iso: 'CL', name: 'Chile',           dial: '+56' },
  { iso: 'CO', name: 'Colômbia',        dial: '+57' },
  { iso: 'MX', name: 'México',          dial: '+52' },
  { iso: 'PE', name: 'Peru',            dial: '+51' },
  { iso: 'UY', name: 'Uruguai',         dial: '+598' },
  { iso: 'AU', name: 'Austrália',       dial: '+61' },
  { iso: 'JP', name: 'Japão',           dial: '+81' }
]

const props = defineProps<{
  modelValue: string  // E.164 sem '+', ex: '5511999998888'
  defaultIso?: string
  placeholder?: string
  disabled?: boolean
  invalid?: boolean
  required?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'change', payload: { dial: string; digits: string; e164: string; iso: string }): void
}>()

const placeholder = computed(() => props.placeholder ?? '99 99999-9999')

// Estado interno: separa código do país e dígitos locais
const selected = ref<Country>(
  COUNTRIES.find(c => c.iso === (props.defaultIso || 'BR')) ?? COUNTRIES[0]
)
const localDigits = ref<string>('')

// ===== Sincroniza modelValue (E.164) ↔ estado interno =====
function applyExternalValue(v: string) {
  // v esperado: dígitos sem +, com DDI. Ex: 5511999998888
  const clean = (v || '').replace(/\D/g, '')
  if (!clean) {
    localDigits.value = ''
    return
  }
  // Tenta achar o país pelo prefixo
  const dialNoPlus = selected.value.dial.replace('+', '')
  if (clean.startsWith(dialNoPlus)) {
    localDigits.value = clean.slice(dialNoPlus.length)
    return
  }
  // Procura outro país que case
  const match = COUNTRIES.find(c => clean.startsWith(c.dial.replace('+', '')))
  if (match) {
    selected.value = match
    localDigits.value = clean.slice(match.dial.replace('+', '').length)
  } else {
    // Sem match — assume que tudo é número local
    localDigits.value = clean
  }
}

watch(() => props.modelValue, applyExternalValue, { immediate: true })

const numberDisplay = computed(() => {
  const m = selected.value.mask ?? maskGeneric
  return m(localDigits.value)
})

function emitChange() {
  const dialNoPlus = selected.value.dial.replace('+', '')
  const e164 = dialNoPlus + localDigits.value
  emit('update:modelValue', e164)
  emit('change', {
    dial: selected.value.dial,
    digits: localDigits.value,
    e164,
    iso: selected.value.iso
  })
}

function onInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value.replace(/\D/g, '')
  // Limite: BR/US 11 dígitos; outros 15 (E.164)
  const max = selected.value.iso === 'BR' ? 11
            : selected.value.iso === 'US' || selected.value.iso === 'CA' ? 10
            : 15
  localDigits.value = raw.slice(0, max)
  emitChange()
}

// ===== Dropdown =====
const open = ref(false)
const search = ref('')
const numberInput = ref<HTMLInputElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
const popStyle = ref<Record<string, string>>({})
const triggerRef = ref<HTMLElement | null>(null)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return COUNTRIES
  return COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.dial.includes(q) ||
    c.iso.toLowerCase().includes(q)
  )
})

function toggle() {
  if (props.disabled) return
  open.value ? close() : openDropdown()
}

function openDropdown() {
  open.value = true
  search.value = ''
  positionPop()
  nextTick(() => searchInput.value?.focus())
}

function close() {
  open.value = false
}

function pick(c: Country) {
  selected.value = c
  emitChange()
  close()
  nextTick(() => numberInput.value?.focus())
}

function positionPop() {
  // Popover ancorado ao trigger; usamos position fixed para escapar de overflow
  const root = triggerRef.value?.closest('.cpi') as HTMLElement | null
  if (!root) return
  const r = root.getBoundingClientRect()
  popStyle.value = {
    position: 'fixed',
    top: `${r.bottom + 6}px`,
    left: `${r.left}px`,
    width: `${Math.max(r.width, 280)}px`
  }
}

function onResize() {
  if (open.value) positionPop()
}

onMounted(() => {
  window.addEventListener('resize', onResize)
  window.addEventListener('scroll', onResize, true)
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  window.removeEventListener('scroll', onResize, true)
})

// Capture o root do componente após mount para posicionamento
onMounted(() => {
  // findFirst ancestor da trigger
  triggerRef.value = (numberInput.value?.parentElement as HTMLElement) ?? null
})
</script>

<style scoped>
.cpi {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: stretch;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  transition: border-color var(--transition-fast), background var(--transition-fast);
  overflow: hidden;
}

.cpi:focus-within {
  background: var(--color-surface-elevated);
  border-color: var(--color-accent);
  box-shadow: var(--focus-ring);
}

.cpi--invalid { border-color: var(--color-error); }
.cpi--open { border-color: var(--color-accent); }

/* Trigger (lado esquerdo) */
.cpi-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  background: transparent;
  border: none;
  border-right: 1px solid var(--color-border);
  color: var(--color-text-primary);
  font-size: 0.9375rem;
  cursor: pointer;
  white-space: nowrap;
  -webkit-tap-highlight-color: transparent;
}

.cpi-trigger:hover { background: var(--color-glass-bg); }

.cpi-flag {
  width: 20px;
  height: 15px;
  flex-shrink: 0;
  border-radius: 2px;
  object-fit: cover;
  display: block;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.06);
}
.cpi-name {
  font-weight: var(--font-medium);
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cpi-dial { color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.cpi-caret { color: var(--color-text-muted); flex-shrink: 0; }

@media (max-width: 480px) {
  .cpi-name { display: none; }
  .cpi-trigger { padding: 0 10px; }
}

/* Number input (lado direito) */
.cpi-number {
  width: 100%;
  border: none;
  background: transparent;
  padding: var(--space-3) var(--space-4);
  color: var(--color-text-primary);
  font-size: 1rem;
  outline: none;
  font-variant-numeric: tabular-nums;
  min-height: var(--control-height-md);
}

.cpi-number::placeholder { color: var(--color-text-muted); }

/* Popover (Teleport pro body) */
:global(.cpi-pop) {
  position: fixed;
  inset: 0;
  z-index: var(--z-popover, 600);
  pointer-events: auto;
}
:global(.cpi-pop-bg) {
  position: absolute;
  inset: 0;
  background: transparent;
}
:global(.cpi-pop-card) {
  background: var(--color-surface-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  display: flex;
  flex-direction: column;
  max-height: min(360px, 60vh);
  overflow: hidden;
}
:global(.cpi-search) {
  width: 100%;
  border: none;
  border-bottom: 1px solid var(--color-border);
  background: transparent;
  padding: 12px 14px;
  color: var(--color-text-primary);
  font-size: 0.9375rem;
  outline: none;
}
:global(.cpi-search::placeholder) { color: var(--color-text-muted); }

:global(.cpi-list) {
  list-style: none;
  margin: 0;
  padding: 4px;
  overflow-y: auto;
}
:global(.cpi-item) {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  font-size: 0.9375rem;
  color: var(--color-text-primary);
  cursor: pointer;
  transition: background-color 120ms ease;
}
:global(.cpi-item:hover) { background: var(--color-glass-bg); }
:global(.cpi-item--active) { background: var(--color-accent-soft); color: var(--color-accent); }
:global(.cpi-item-name) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
:global(.cpi-item-dial) {
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
  font-size: 0.875rem;
}
:global(.cpi-item--active .cpi-item-dial) { color: var(--color-accent); opacity: 0.8; }
:global(.cpi-empty) {
  padding: 16px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}
</style>
