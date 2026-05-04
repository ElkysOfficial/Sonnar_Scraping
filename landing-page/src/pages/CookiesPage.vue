<template>
  <main class="legal-page">
    <div class="container container-text">
      <header class="legal-head">
        <p class="legal-eyebrow">Documentos legais</p>
        <h1 class="legal-title">Política de Cookies</h1>
        <p class="legal-meta">
          Última atualização: 29 de abril de 2026
        </p>
      </header>

      <section class="legal-content">
        <h2>1. O que são cookies</h2>
        <p>
          Cookies são pequenos arquivos armazenados no seu dispositivo quando você acessa um
          site. Eles permitem que a página reconheça seu navegador, lembre preferências e
          melhore a experiência de uso.
        </p>

        <h2>2. Tipos de cookies que usamos</h2>

        <h3>2.1. Essenciais</h3>
        <p>
          Indispensáveis para o funcionamento da Plataforma — autenticação, sessão, segurança
          e preferências básicas (p.ex. tema claro/escuro). Sem eles a Sonnar não opera.
        </p>
        <table class="legal-table">
          <thead>
            <tr><th>Cookie</th><th>Finalidade</th><th>Duração</th></tr>
          </thead>
          <tbody>
            <tr><td><code>sonnar-session</code></td><td>Sessão do usuário autenticado</td><td>Sessão</td></tr>
            <tr><td><code>sonnar-theme</code></td><td>Lembra a escolha de tema (claro/escuro)</td><td>1 ano</td></tr>
            <tr><td><code>csrf-token</code></td><td>Proteção contra ataques CSRF</td><td>Sessão</td></tr>
          </tbody>
        </table>

        <h3>2.2. Funcionais</h3>
        <p>
          Lembram suas preferências (idioma, filtros de stack, último canal usado) para
          personalizar o serviço.
        </p>

        <h3>2.3. Analíticos</h3>
        <p>
          Coletam dados agregados de uso (páginas mais visitadas, tempo de permanência,
          performance). Usamos provedores como <em>Google Analytics</em> /
          <em>Plausible</em> com pseudonimização do IP sempre que possível.
        </p>

        <h3>2.4. Marketing</h3>
        <p>
          Mensuram a efetividade de campanhas e podem ser definidos por terceiros
          (p.ex. <em>Meta Pixel</em>, <em>Google Ads</em>). São ativados apenas após seu
          consentimento.
        </p>

        <h2>3. Cookies de terceiros</h2>
        <p>
          Alguns parceiros (gateway de pagamento, embed do YouTube, ferramentas de suporte)
          podem definir cookies próprios. A Sonnar não controla esses cookies; consulte as
          políticas dos respectivos provedores.
        </p>

        <h2>4. Como gerenciar</h2>
        <p>
          Você pode aceitar, recusar ou revogar seu consentimento a qualquer momento pelo
          banner de cookies exibido no primeiro acesso. Também é possível bloquear cookies
          diretamente no seu navegador:
        </p>
        <ul>
          <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener">Google Chrome</a></li>
          <li><a href="https://support.mozilla.org/pt-BR/kb/ative-e-desative-os-cookies-que-os-sites-usam" target="_blank" rel="noopener">Mozilla Firefox</a></li>
          <li><a href="https://support.apple.com/pt-br/guide/safari/sfri11471/mac" target="_blank" rel="noopener">Safari</a></li>
          <li><a href="https://support.microsoft.com/pt-br/microsoft-edge" target="_blank" rel="noopener">Microsoft Edge</a></li>
        </ul>
        <p>
          O bloqueio de cookies essenciais pode comprometer o funcionamento da Plataforma.
        </p>

        <h2>5. Base legal</h2>
        <p>
          Cookies essenciais são tratados com base em <strong>legítimo interesse</strong> e
          <strong>execução de contrato</strong>. Cookies não essenciais (analíticos e
          marketing) são tratados mediante <strong>consentimento</strong>, que pode ser
          revogado a qualquer momento.
        </p>

        <h2>6. Atualizações</h2>
        <p>
          Esta política pode ser atualizada para refletir novas tecnologias ou mudanças
          regulatórias. A versão vigente será sempre identificada pela data no topo.
        </p>

        <h2>7. Contato</h2>
        <p>
          Dúvidas sobre cookies:
          <a href="mailto:dpo@sonnarjobs.com.br">dpo@sonnarjobs.com.br</a>.
        </p>
      </section>
    </div>
  </main>
</template>

<script>
export default { name: 'CookiesPage' }
</script>

<style scoped>
@import './legal-page.css';
</style>
