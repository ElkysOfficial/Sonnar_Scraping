<template>
  <div class="dperfil">
    <!-- Hero -->
    <header class="dperfil-hero">
      <div class="dperfil-hero__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="13" x2="15" y2="13" />
          <line x1="9" y1="17" x2="13" y2="17" />
        </svg>
      </div>
      <div class="dperfil-hero__body">
        <h1>Perfil de carreira</h1>
        <p>
          Seu currículo analisado para personalizar as vagas que você recebe + consultoria humana
          de LinkedIn e CV quando precisar de uma revisão individual.
        </p>
      </div>
    </header>

    <!-- Banner pra Free / Pro -->
    <div
      v-if="!isPlus && subscriber?.plan"
      class="dperfil-banner dperfil-banner--upgrade"
    >
      <div class="dperfil-banner__icon">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m12 3 1.9 5.8H20l-4.95 3.6 1.9 5.8L12 14.6l-4.95 3.6 1.9-5.8L4 8.8h6.1z" />
        </svg>
      </div>
      <div class="dperfil-banner__body">
        <h2>Esses recursos são exclusivos do Plus</h2>
        <p v-if="subscriber.plan === 'pro'">
          No Pro você recebe as vagas no grupo. No Plus, além das vagas filtradas pelo seu stack
          no privado, a gente analisa seu CV em cada mensagem e você marca consultoria 1-1 com nosso time.
        </p>
        <p v-else>
          Anexe seu CV, receba análise automática de skills e marque uma consultoria 1-1 de
          LinkedIn e CV com nosso time. Tudo no plano Plus.
        </p>
      </div>
      <router-link to="/dashboard/configuracoes?tab=assinatura" class="btn btn-primary">
        Fazer upgrade pro Plus
      </router-link>
    </div>

    <!-- Plus: layout em 2 colunas -->
    <div v-else-if="isPlus && subscriber?.id" class="dperfil-grid">
      <section class="dperfil-card">
        <ResumeUpload :subscriber-id="subscriber.id" />
      </section>
      <section class="dperfil-card">
        <ConsultoriaForm :subscriber-id="subscriber.id" />
      </section>
    </div>

    <div v-else class="dperfil-loading">Carregando…</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAuth } from '@/composables/useAuth'
import ResumeUpload from '@/components/ResumeUpload.vue'
import ConsultoriaForm from '@/components/ConsultoriaForm.vue'

const { subscriber } = useAuth()
const isPlus = computed(() => subscriber.value?.plan === 'plus')
</script>

<style scoped>
.dperfil {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* ─── Hero ─── */
.dperfil-hero {
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 18px;
  align-items: center;
  padding: 24px 28px;
  border-radius: 18px;
  background:
    linear-gradient(135deg,
      color-mix(in srgb, var(--color-accent) 10%, transparent),
      color-mix(in srgb, var(--color-accent) 3%, transparent)
    ),
    var(--color-surface, #fff);
  border: 1px solid color-mix(in srgb, var(--color-accent) 18%, transparent);
}

.dperfil-hero__icon {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  background: color-mix(in srgb, var(--color-accent) 18%, transparent);
  color: var(--color-accent);
}

.dperfil-hero__body h1 {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--color-text, inherit);
}

.dperfil-hero__body p {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  color: var(--color-text-muted, #6b7280);
}

/* ─── Banner upgrade ─── */
.dperfil-banner {
  display: grid;
  grid-template-columns: 48px 1fr auto;
  gap: 16px;
  align-items: center;
  padding: 20px 24px;
  border-radius: 16px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--color-accent) 8%, transparent),
    color-mix(in srgb, var(--color-accent) 2%, transparent)
  );
  border: 1px solid color-mix(in srgb, var(--color-accent) 22%, transparent);
}

.dperfil-banner__icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-accent) 16%, transparent);
  color: var(--color-accent);
}

.dperfil-banner__body h2 {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 600;
}

.dperfil-banner__body p {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-text-muted, #6b7280);
}

/* ─── Grid de cards ─── */
.dperfil-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.dperfil-card {
  min-width: 0;
}

/* O ResumeUpload e o ConsultoriaForm ja trazem seu proprio card visual
   (background + border + radius). Aqui so garantimos espaco entre eles. */

.dperfil-loading {
  text-align: center;
  color: var(--color-text-muted, #6b7280);
  padding: 32px;
}

/* ─── Responsivo ─── */
@media (max-width: 980px) {
  .dperfil-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .dperfil-hero {
    grid-template-columns: 48px 1fr;
    gap: 14px;
    padding: 20px;
  }
  .dperfil-hero__icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
  }
  .dperfil-hero__body h1 {
    font-size: 18px;
  }
  .dperfil-banner {
    grid-template-columns: 1fr;
    text-align: center;
  }
  .dperfil-banner__icon {
    margin: 0 auto;
  }
  .dperfil-banner .btn {
    width: 100%;
  }
}
</style>
