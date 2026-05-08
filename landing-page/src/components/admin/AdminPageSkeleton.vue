<template>
  <!--
    Skeleton parametrizável p/ páginas admin. Usa as classes globais .skeleton-*
    com animação pulse. Cada variant reproduz o esqueleto da página real para
    que o salto pra dados carregados seja imperceptível.
  -->
  <div class="admin-skel" :data-variant="variant">
    <!-- Header padrão (título + ação) -->
    <header v-if="showHeader" class="admin-skel__header">
      <div class="admin-skel__title-wrap">
        <div class="skeleton skeleton-text skeleton-text--title"></div>
        <div class="skeleton skeleton-text" style="width: 60%"></div>
      </div>
      <div v-if="showAction" class="skeleton skeleton-button" style="width: 8.75rem"></div>
    </header>

    <!-- KPI grid (overview pages) -->
    <div
      v-if="variant === 'kpi-grid' || variant === 'dashboard'"
      class="admin-skel__kpi-grid skeleton-stagger"
    >
      <div
        v-for="n in (kpiCount || 4)"
        :key="`kpi-${n}`"
        class="admin-skel__kpi"
      >
        <div class="skeleton skeleton-text" style="width: 50%; height: 0.65em"></div>
        <div class="skeleton skeleton-text--lg" style="width: 70%; height: 1.75em; margin-top: var(--space-3)"></div>
        <div class="skeleton skeleton-text" style="width: 40%; height: 0.6em; margin-top: var(--space-3)"></div>
      </div>
    </div>

    <!-- Charts grid (2 colunas) -->
    <div
      v-if="variant === 'charts' || variant === 'dashboard'"
      class="admin-skel__charts"
    >
      <div class="admin-skel__chart-card">
        <div class="skeleton skeleton-text skeleton-text--title"></div>
        <div class="skeleton skeleton-block" style="height: 14rem; margin-top: var(--space-4)"></div>
      </div>
      <div class="admin-skel__chart-card">
        <div class="skeleton skeleton-text skeleton-text--title"></div>
        <div class="skeleton skeleton-block" style="height: 14rem; margin-top: var(--space-4)"></div>
      </div>
    </div>

    <!-- Table -->
    <div
      v-if="variant === 'table' || variant === 'dashboard'"
      class="admin-skel__table"
    >
      <div class="admin-skel__table-head">
        <div
          v-for="n in (columns || 5)"
          :key="`th-${n}`"
          class="skeleton skeleton-text"
          style="height: 0.75em"
        ></div>
      </div>
      <div class="admin-skel__table-body skeleton-stagger">
        <div
          v-for="row in (rows || 6)"
          :key="`row-${row}`"
          class="admin-skel__table-row"
        >
          <div
            v-for="col in (columns || 5)"
            :key="`cell-${row}-${col}`"
            class="skeleton skeleton-text"
            :style="{ height: '0.85em', width: cellWidth(col) }"
          ></div>
        </div>
      </div>
    </div>

    <!-- Card list (admins, listagens vertcais) -->
    <div
      v-if="variant === 'card-list'"
      class="admin-skel__card-list skeleton-stagger"
    >
      <div
        v-for="n in (rows || 5)"
        :key="`card-${n}`"
        class="admin-skel__list-card"
      >
        <div class="skeleton skeleton-avatar"></div>
        <div class="admin-skel__list-card-body">
          <div class="skeleton skeleton-text" style="width: 45%"></div>
          <div class="skeleton skeleton-text" style="width: 25%; height: 0.6em"></div>
        </div>
        <div class="skeleton skeleton-button" style="width: 5rem"></div>
      </div>
    </div>

    <!-- Form -->
    <div v-if="variant === 'form'" class="admin-skel__form">
      <div class="admin-skel__form-card">
        <div class="skeleton skeleton-text skeleton-text--title"></div>
        <div
          v-for="n in 4"
          :key="`field-${n}`"
          class="admin-skel__form-field"
        >
          <div class="skeleton skeleton-text" style="width: 25%; height: 0.6em"></div>
          <div class="skeleton skeleton-block" style="height: var(--control-height-md); margin-top: var(--space-2)"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  variant: {
    type: String,
    default: 'kpi-grid',
    validator: (v) => ['kpi-grid', 'charts', 'dashboard', 'table', 'card-list', 'form'].includes(v),
  },
  showHeader: { type: Boolean, default: true },
  showAction: { type: Boolean, default: true },
  kpiCount:   { type: Number, default: 4 },
  rows:       { type: Number, default: 6 },
  columns:    { type: Number, default: 5 },
})

// Larguras pseudo-aleatórias mas determinísticas para as células da tabela:
// dá uma sensação orgânica sem virar "barra cheia uniforme".
function cellWidth(col) {
  const widths = ['72%', '55%', '40%', '60%', '48%', '38%', '65%']
  return widths[(col - 1) % widths.length]
}
</script>

<style scoped>
.admin-skel {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  width: 100%;
}

.admin-skel__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;
}
.admin-skel__title-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

/* KPI grid — colunas explícitas, sem auto-fit (evita coluna vazia) */
.admin-skel__kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-4);
}
@media (max-width: 1024px) { .admin-skel__kpi-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 560px)  { .admin-skel__kpi-grid { grid-template-columns: 1fr; } }

.admin-skel__kpi {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: var(--space-5);
  min-height: 7.5rem;
  display: flex;
  flex-direction: column;
}

/* Charts */
.admin-skel__charts {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-4);
}
@media (max-width: 900px) { .admin-skel__charts { grid-template-columns: 1fr; } }

.admin-skel__chart-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: var(--space-5);
}

/* Table */
.admin-skel__table {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: var(--space-5);
}
.admin-skel__table-head,
.admin-skel__table-row {
  display: grid;
  grid-template-columns: 2fr 1.5fr 1fr 1fr 0.8fr;
  gap: var(--space-4);
  align-items: center;
}
.admin-skel__table-head {
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--color-border-subtle);
  margin-bottom: var(--space-3);
}
.admin-skel__table-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.admin-skel__table-row {
  padding: var(--space-2) 0;
}
@media (max-width: 768px) {
  .admin-skel__table-head { display: none; }
  .admin-skel__table-row {
    grid-template-columns: 1fr;
    border-bottom: 1px solid var(--color-border-subtle);
    padding-bottom: var(--space-3);
  }
}

/* Card list */
.admin-skel__card-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.admin-skel__list-card {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
}
.admin-skel__list-card-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

/* Form */
.admin-skel__form {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: var(--space-4);
}
@media (max-width: 1024px) { .admin-skel__form { grid-template-columns: 1fr; } }

.admin-skel__form-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.admin-skel__form-field {
  display: flex;
  flex-direction: column;
}
</style>
