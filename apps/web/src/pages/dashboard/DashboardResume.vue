<template>
  <div class="dresume">
    <!-- Banner para usuarios free (upsell) -->
    <div v-if="subscriber?.plan === 'free'" class="dresume-banner dresume-banner--upgrade">
      <div class="dresume-banner__icon">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="14" x2="15" y2="14" />
          <line x1="9" y1="18" x2="13" y2="18" />
        </svg>
      </div>
      <div class="dresume-banner__body">
        <h2>Upload de currículo é exclusivo Plus</h2>
        <p>
          No plano Plus você anexa seu CV em PDF/DOCX e a gente extrai automaticamente
          suas skills, anos de experiência e nível — com isso, cada vaga recebida traz
          uma comparação clara CV × vaga (qual skill bate, anos exigidos, senioridade).
        </p>
      </div>
      <router-link to="/dashboard/configuracoes?tab=assinatura" class="btn btn-primary">
        Fazer upgrade pro Plus
      </router-link>
    </div>

    <!-- Banner para usuarios pro (upsell) -->
    <div v-else-if="subscriber?.plan === 'pro'" class="dresume-banner dresume-banner--upgrade">
      <div class="dresume-banner__icon">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      </div>
      <div class="dresume-banner__body">
        <h2>Análise de currículo é exclusivo Plus</h2>
        <p>
          No Pro você recebe todas as vagas do grupo. No Plus, além das vagas filtradas pelo
          seu stack no privado, a gente ainda compara cada uma com o seu currículo.
        </p>
      </div>
      <router-link to="/dashboard/configuracoes?tab=assinatura" class="btn btn-primary">
        Upgrade pro Plus
      </router-link>
    </div>

    <!-- Componente de upload (apenas Plus) -->
    <ResumeUpload
      v-else-if="subscriber?.plan === 'plus' && subscriber?.id"
      :subscriber-id="subscriber.id"
    />

    <!-- Loading enquanto subscriber nao foi carregado -->
    <div v-else class="dresume-loading">Carregando…</div>
  </div>
</template>

<script setup>
import { useAuth } from '@/composables/useAuth'
import ResumeUpload from '@/components/ResumeUpload.vue'

const { subscriber } = useAuth()
</script>

<style scoped>
.dresume {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.dresume-banner {
  display: grid;
  grid-template-columns: 48px 1fr auto;
  gap: 16px;
  align-items: center;
  padding: 20px;
  border-radius: 16px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--color-accent) 8%, transparent),
    color-mix(in srgb, var(--color-accent) 2%, transparent)
  );
  border: 1px solid color-mix(in srgb, var(--color-accent) 25%, transparent);
}

.dresume-banner__icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-accent) 15%, transparent);
  color: var(--color-accent);
  display: flex;
  align-items: center;
  justify-content: center;
}

.dresume-banner__body {
  min-width: 0;
}

.dresume-banner__body h2 {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 4px;
}

.dresume-banner__body p {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 14px;
  line-height: 1.5;
}

.dresume-loading {
  color: var(--color-text-muted);
  font-size: 14px;
  padding: 24px;
  text-align: center;
}

@media (max-width: 720px) {
  .dresume-banner {
    grid-template-columns: 1fr;
    text-align: center;
  }
  .dresume-banner__icon {
    margin: 0 auto;
  }
}
</style>
