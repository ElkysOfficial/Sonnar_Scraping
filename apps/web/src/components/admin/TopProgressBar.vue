<template>
  <!--
    Barra fina, fixa no topo, p/ refresh-while-data-visible.
    Aparece quando `active=true` e some quando termina (com pequeno fade).
    Use no AdminLayout ou em páginas que controlem refresh isoladamente.
  -->
  <Transition name="topbar-fade">
    <div v-if="active" class="top-progress" role="progressbar" aria-busy="true" aria-label="Atualizando">
      <div class="top-progress__bar"></div>
    </div>
  </Transition>
</template>

<script setup>
defineProps({
  active: { type: Boolean, default: false },
})
</script>

<style scoped>
.topbar-fade-enter-active,
.topbar-fade-leave-active {
  transition: opacity var(--transition-base);
}
.topbar-fade-enter-from,
.topbar-fade-leave-to {
  opacity: 0;
}
</style>
