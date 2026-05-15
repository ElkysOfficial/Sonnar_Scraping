<template>
  <div class="empty-detection">
    <div class="empty-detection__icon">
      <div class="empty-detection__wave empty-detection__wave--1"></div>
      <div class="empty-detection__wave empty-detection__wave--2"></div>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        class="empty-detection__svg"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          :d="iconPath"
        />
      </svg>
    </div>
    <h3 class="empty-detection__title">{{ title }}</h3>
    <p class="empty-detection__subtitle">{{ subtitle }}</p>
    <slot name="action"></slot>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  title?: string
  subtitle?: string
  icon?: 'search' | 'users' | 'inbox' | 'signal'
}>()

const iconPath = computed(() => {
  switch (props.icon) {
    case 'users':
      return 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z'
    case 'inbox':
      return 'M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-17.5-.011V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z'
    case 'signal':
      return 'M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.789M12 12h.008v.008H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z'
    default: // search
      return 'M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z'
  }
})
</script>

<style scoped>
.empty-detection {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-12) var(--space-6);
  text-align: center;
}

.empty-detection__icon {
  position: relative;
  width: 72px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--space-5);
}

.empty-detection__wave {
  position: absolute;
  border-radius: 50%;
  border: 1px solid var(--color-border);
  opacity: 0;
}

.empty-detection__wave--1 {
  width: 100%;
  height: 100%;
  animation: emptyWave 3.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

.empty-detection__wave--2 {
  width: 100%;
  height: 100%;
  animation: emptyWave 3.5s cubic-bezier(0.4, 0, 0.2, 1) infinite 1.2s;
}

@keyframes emptyWave {
  0% {
    transform: scale(0.6);
    opacity: 0.12;
  }
  100% {
    transform: scale(1.8);
    opacity: 0;
  }
}

.empty-detection__svg {
  width: 28px;
  height: 28px;
  color: var(--color-text-muted);
  opacity: 0.5;
  z-index: 1;
}

.empty-detection__title {
  font-size: var(--text-base);
  font-weight: var(--font-medium);
  color: var(--color-text-secondary);
  margin: 0 0 var(--space-1);
}

.empty-detection__subtitle {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin: 0;
  max-width: 280px;
}
</style>
