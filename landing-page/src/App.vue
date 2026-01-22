<template>
  <div id="app">
    <a href="#main-content" class="skip-link">Ir para conteúdo principal</a>

    <AppHeader />

    <main id="main-content">
      <HeroSection />
      <HowItWorksSection />
      <MapSection />
      <PricingSection />
      <FaqSection />
      <ContactSection />
    </main>

    <AppFooter />
  </div>
</template>

<script>
import AppHeader from './components/AppHeader.vue'
import HeroSection from './components/HeroSection.vue'
import HowItWorksSection from './components/HowItWorksSection.vue'
import MapSection from './components/MapSection.vue'
import PricingSection from './components/PricingSection.vue'
import FaqSection from './components/FaqSection.vue'
import ContactSection from './components/ContactSection.vue'
import AppFooter from './components/AppFooter.vue'

export default {
  name: 'App',
  components: {
    AppHeader,
    HeroSection,
    HowItWorksSection,
    MapSection,
    PricingSection,
    FaqSection,
    ContactSection,
    AppFooter
  }
}
</script>

<style>
/* App-level styles are in assets/styles.css */
</style>
