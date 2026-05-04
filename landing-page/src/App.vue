<template>
  <a-config-provider>
    <div id="app">
      <a
        href="#main-content"
        class="skip-link"
      >Ir para conteúdo principal</a>

      <AppHeader v-if="showHeader" />

      <main id="main-content">
        <router-view v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>

      <AppFooter v-if="showFooter" />

      <CookieBanner />

      <SessionNotice />
    </div>
  </a-config-provider>
</template>

<script>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { ConfigProvider as AConfigProvider } from 'ant-design-vue'
import AppHeader from './components/AppHeader.vue'
import AppFooter from './components/AppFooter.vue'
import CookieBanner from './components/CookieBanner.vue'
import SessionNotice from './components/SessionNotice.vue'

export default {
  name: 'App',
  components: {
    AConfigProvider,
    AppHeader,
    AppFooter,
    CookieBanner,
    SessionNotice
  },
  setup() {
    const route = useRoute()

    // Hide header/footer on auth pages and dashboard/admin layouts.
    // NotFound (catch-all) sempre mostra chrome — mesmo se a URL parecer
    // /dashboard/foo, queremos contexto de navegação pro usuário voltar.
    const authPages = ['Signup', 'Login', 'ChangePassword']
    const dashboardRoutes = ['/admin', '/dashboard']

    const isChromeHidden = computed(() => {
      if (route.name === 'NotFound') return false
      const isAuthPage = authPages.includes(String(route.name))
      const isDashboard = dashboardRoutes.some(r => route.path.startsWith(r))
      return isAuthPage || isDashboard
    })

    const showHeader = computed(() => !isChromeHidden.value)
    const showFooter = computed(() => !isChromeHidden.value)

    return {
      showHeader,
      showFooter
    }
  }
}
</script>

<style>
/* App-level styles are in assets/styles.css */
</style>
