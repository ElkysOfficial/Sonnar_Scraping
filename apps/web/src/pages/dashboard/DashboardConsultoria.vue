<template>
  <div class="dconsultoria">
    <!-- Banner para usuarios free/pro (upsell) -->
    <div
      v-if="subscriber?.plan !== 'plus'"
      class="dconsultoria-banner dconsultoria-banner--upgrade"
    >
      <div class="dconsultoria-banner__icon">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      </div>
      <div class="dconsultoria-banner__body">
        <h2>Consultoria humana é exclusivo Plus</h2>
        <p>
          No Plus, você agenda uma conversa individual com nossa equipe pra revisão
          de currículo e LinkedIn. Análise prática, sem retórica genérica — vamos no
          que importa pra você ser chamado pras vagas certas.
        </p>
      </div>
      <router-link to="/dashboard/configuracoes?tab=assinatura" class="btn btn-primary">
        Fazer upgrade pro Plus
      </router-link>
    </div>

    <!-- Formulario + historico (apenas Plus) -->
    <ConsultoriaForm
      v-else-if="subscriber?.id"
      :subscriber-id="subscriber.id"
    />

    <div v-else class="dconsultoria-loading">Carregando…</div>
  </div>
</template>

<script setup>
import { useAuth } from '@/composables/useAuth'
import ConsultoriaForm from '@/components/ConsultoriaForm.vue'

const { subscriber } = useAuth()
</script>

<style scoped>
.dconsultoria {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.dconsultoria-banner {
  display: grid;
  grid-template-columns: 48px 1fr auto;
  gap: 16px;
  align-items: center;
  padding: 20px;
  border-radius: 16px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--color-accent) 8%, transparent),
    color-mix(in srgb, var(--color-accent) 4%, transparent)
  );
  border: 1px solid color-mix(in srgb, var(--color-accent) 20%, transparent);
}

.dconsultoria-banner__icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-accent) 15%, transparent);
  color: var(--color-accent);
}

.dconsultoria-banner__body h2 {
  font-size: 16px;
  margin: 0 0 4px;
}

.dconsultoria-banner__body p {
  font-size: 14px;
  margin: 0;
  line-height: 1.5;
  color: var(--color-text-muted);
}

.dconsultoria-loading {
  text-align: center;
  color: var(--color-text-muted);
  padding: 32px;
}

@media (max-width: 720px) {
  .dconsultoria-banner {
    grid-template-columns: 48px 1fr;
  }
  .dconsultoria-banner .btn {
    grid-column: 1 / -1;
  }
}
</style>
