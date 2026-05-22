<template>
  <!--
    Unidade de anúncio do Google AdSense.

    O loader (adsbygoogle.js) é carregado uma única vez no index.html.
    Aqui só renderizamos o <ins> e enfileiramos uma requisição de anúncio
    quando o componente monta. Cada montagem cria um <ins> novo, então o
    push() nunca colide com um slot já preenchido (causa do erro
    "All 'ins' elements ... already have ads").

    Padrão: unidade "in-article" / formato "fluid" — pensada para fluir
    entre blocos de conteúdo, ideal entre os cards de vaga.
  -->
  <ins
    class="adsbygoogle"
    style="display:block; text-align:center;"
    :data-ad-client="adClient"
    :data-ad-slot="adSlot"
    :data-ad-format="adFormat"
    :data-ad-layout="adLayout || undefined"
  ></ins>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'

withDefaults(
  defineProps<{
    /** ID do publisher AdSense (ca-pub-...). */
    adClient?: string
    /** ID da unidade de anúncio criada no painel do AdSense. */
    adSlot?: string
    /** Formato do anúncio — "fluid" para unidades in-article/in-feed. */
    adFormat?: string
    /** Layout do anúncio — "in-article" flui entre blocos de conteúdo. */
    adLayout?: string
  }>(),
  {
    adClient: 'ca-pub-7896888594916293',
    adSlot: '7224635505',
    adFormat: 'fluid',
    adLayout: 'in-article',
  },
)

onMounted(() => {
  // window.adsbygoogle vira um array (do snippet do index.html) mesmo antes
  // do loader terminar de baixar; o push() fica enfileirado e é processado
  // assim que o script carrega. Se o usuário tiver um bloqueador, o push
  // só fica na fila — nada quebra.
  try {
    const w = window as unknown as { adsbygoogle?: unknown[] }
    w.adsbygoogle = w.adsbygoogle || []
    w.adsbygoogle.push({})
  } catch (err) {
    console.warn('AdSense indisponível:', err)
  }
})
</script>

<style scoped>
.adsbygoogle {
  display: block;
  width: 100%;
}
</style>
