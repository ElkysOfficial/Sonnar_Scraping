<template>
  <div class="home-page">
    <HeroSection />
    <SocialProofBar />
    <HowItWorksSection />
    <MapSection />
    <PricingSection />
    <FaqSection />
  </div>
</template>

<script>
import { defineAsyncComponent } from 'vue'
import HeroSection from '../components/HeroSection.vue'
import SocialProofBar from '../components/SocialProofBar.vue'

// Lazy load componentes abaixo da dobra para melhorar LCP
const HowItWorksSection = defineAsyncComponent(() =>
  import('../components/HowItWorksSection.vue')
)
const MapSection = defineAsyncComponent(() =>
  import('../components/MapSection.vue')
)
const PricingSection = defineAsyncComponent(() =>
  import('../components/PricingSection.vue')
)
const FaqSection = defineAsyncComponent(() =>
  import('../components/FaqSection.vue')
)

export default {
  name: 'HomePage',
  components: {
    HeroSection,
    SocialProofBar,
    HowItWorksSection,
    MapSection,
    PricingSection,
    FaqSection
  }
}
</script>
