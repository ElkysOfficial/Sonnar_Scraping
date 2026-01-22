<template>
  <section id="cobertura" class="coverage-section">
    <!-- Background with subtle depth -->
    <div class="coverage-bg"></div>

    <div class="coverage-container">
      <!-- Header -->
      <header class="coverage-header">
        <h2 class="coverage-title">Cobertura Global</h2>
        <p class="coverage-subtitle">
          Vagas extraídas de múltiplas fontes ao redor do mundo
        </p>
      </header>

      <!-- Controls Row -->
      <div class="coverage-controls">
        <!-- Segmented Control -->
        <div class="segmented-control">
          <button
            :class="['segment', { active: activeMap === 'brazil' }]"
            @click="switchMap('brazil')"
          >
            Brasil
          </button>
          <button
            :class="['segment', { active: activeMap === 'world' }]"
            @click="switchMap('world')"
          >
            Mundo
          </button>
          <div class="segment-indicator" :class="activeMap"></div>
        </div>
      </div>

      <!-- Metrics Row -->
      <div class="coverage-metrics">
        <div class="metric">
          <span class="metric-value">{{ totalJobs.toLocaleString('pt-BR') }}</span>
          <span class="metric-label">vagas extraídas</span>
        </div>
        <div class="metric-divider"></div>
        <div class="metric">
          <span class="metric-value">{{ activeMap === 'brazil' ? '27' : countriesWithJobs }}</span>
          <span class="metric-label">{{ activeMap === 'brazil' ? 'estados' : 'países' }}</span>
        </div>
      </div>

      <!-- Map Area - Floating without box -->
      <div class="map-stage">
        <!-- Radial glow behind map -->
        <div class="map-glow"></div>

        <!-- Brazil Map -->
        <div
          :class="['map-canvas', { active: activeMap === 'brazil', leaving: isTransitioning && activeMap !== 'brazil' }]"
          v-show="activeMap === 'brazil' || isTransitioning"
        >
          <div
            ref="brazilSvgContainer"
            class="svg-container brazil-svg"
            @mouseleave="hideTooltip"
          ></div>
        </div>

        <!-- World Map -->
        <div
          :class="['map-canvas', { active: activeMap === 'world', leaving: isTransitioning && activeMap !== 'world' }]"
          v-show="activeMap === 'world' || isTransitioning"
        >
          <div
            ref="worldSvgContainer"
            class="svg-container world-svg"
            @mouseleave="hideTooltip"
          ></div>
        </div>
      </div>

      <!-- Legend - Clean and minimal -->
      <div class="coverage-legend">
        <span class="legend-label">Menos vagas</span>
        <div class="legend-gradient"></div>
        <span class="legend-label">Mais vagas</span>
      </div>

      <!-- Tooltip -->
      <Transition name="tooltip">
        <div
          v-if="tooltip.visible"
          class="map-tooltip"
          :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
        >
          <span class="tooltip-name">{{ tooltip.name }}</span>
          <span class="tooltip-value">{{ tooltip.jobs.toLocaleString('pt-BR') }} vagas</span>
        </div>
      </Transition>
    </div>
  </section>
</template>

<script>
export default {
  name: 'MapSection',
  emits: ['selectUF', 'selectCountry'],
  data() {
    return {
      activeMap: 'brazil',
      previousMap: null,
      isTransitioning: false,
      brazilSvgLoaded: false,
      worldSvgLoaded: false,
      tooltip: {
        visible: false,
        x: 0,
        y: 0,
        name: '',
        jobs: 0
      },
      stateMapping: {
        'Rondonia': { uf: 'RO', name: 'Rondônia' },
        'Roraima': { uf: 'RR', name: 'Roraima' },
        'Acre': { uf: 'AC', name: 'Acre' },
        'Amazonas': { uf: 'AM', name: 'Amazonas' },
        'Amapa': { uf: 'AP', name: 'Amapá' },
        'Tocantins': { uf: 'TO', name: 'Tocantins' },
        'MatoGrosso': { uf: 'MT', name: 'Mato Grosso' },
        'Goias': { uf: 'GO', name: 'Goiás' },
        'MatoGrosso_do_Sul': { uf: 'MS', name: 'Mato Grosso do Sul' },
        'MinasGerais': { uf: 'MG', name: 'Minas Gerais' },
        'Parana': { uf: 'PR', name: 'Paraná' },
        'RioGrand_do_Sul': { uf: 'RS', name: 'Rio Grande do Sul' },
        'Bahina': { uf: 'BA', name: 'Bahia' },
        'Piaui': { uf: 'PI', name: 'Piauí' },
        'Ceara': { uf: 'CE', name: 'Ceará' },
        'Fernando_de_Noronha': { uf: 'PE', name: 'Fernando de Noronha' },
        'Alagoas': { uf: 'AL', name: 'Alagoas' },
        'Sergipe': { uf: 'SE', name: 'Sergipe' },
        'BrasiliaDistritoFederal': { uf: 'DF', name: 'Distrito Federal' },
        'Pernambuco': { uf: 'PE', name: 'Pernambuco' },
        'Maranhao': { uf: 'MA', name: 'Maranhão' },
        'Para': { uf: 'PA', name: 'Pará' },
        'SaoPaulo': { uf: 'SP', name: 'São Paulo' },
        'Rio_deJaneiro': { uf: 'RJ', name: 'Rio de Janeiro' },
        'EspiritoSanto': { uf: 'ES', name: 'Espírito Santo' },
        'SantaCatarina': { uf: 'SC', name: 'Santa Catarina' },
        'Paraiba': { uf: 'PB', name: 'Paraíba' },
        'RioGrande_doNorte': { uf: 'RN', name: 'Rio Grande do Norte' }
      },
      countryMapping: {
        'AD': 'Andorra', 'AE': 'Emirados Árabes', 'AF': 'Afeganistão', 'AG': 'Antígua e Barbuda',
        'AI': 'Anguilla', 'AL': 'Albânia', 'AM': 'Armênia', 'AO': 'Angola',
        'AR': 'Argentina', 'AS': 'Samoa Americana', 'AT': 'Áustria', 'AU': 'Austrália',
        'AW': 'Aruba', 'AX': 'Ilhas Aland', 'AZ': 'Azerbaijão', 'BA': 'Bósnia e Herzegovina',
        'BB': 'Barbados', 'BD': 'Bangladesh', 'BE': 'Bélgica', 'BF': 'Burkina Faso',
        'BG': 'Bulgária', 'BH': 'Bahrain', 'BI': 'Burundi', 'BJ': 'Benin',
        'BL': 'São Bartolomeu', 'BN': 'Brunei', 'BO': 'Bolívia', 'BM': 'Bermudas',
        'BQ': 'Bonaire', 'BR': 'Brasil', 'BS': 'Bahamas', 'BT': 'Butão',
        'BV': 'Ilha Bouvet', 'BW': 'Botswana', 'BY': 'Bielorrússia', 'BZ': 'Belize',
        'CA': 'Canadá', 'CC': 'Ilhas Cocos', 'CD': 'Congo (RDC)', 'CF': 'República Centro-Africana',
        'CG': 'Congo', 'CH': 'Suíça', 'CI': 'Costa do Marfim', 'CK': 'Ilhas Cook',
        'CL': 'Chile', 'CM': 'Camarões', 'CN': 'China', 'CO': 'Colômbia',
        'CR': 'Costa Rica', 'CU': 'Cuba', 'CV': 'Cabo Verde', 'CW': 'Curaçao',
        'CX': 'Ilha Christmas', 'CY': 'Chipre', 'CZ': 'República Tcheca', 'DE': 'Alemanha',
        'DJ': 'Djibuti', 'DK': 'Dinamarca', 'DM': 'Dominica', 'DO': 'República Dominicana',
        'DZ': 'Argélia', 'EC': 'Equador', 'EE': 'Estônia', 'EG': 'Egito',
        'EH': 'Saara Ocidental', 'ER': 'Eritreia', 'ES': 'Espanha', 'ET': 'Etiópia',
        'FI': 'Finlândia', 'FJ': 'Fiji', 'FK': 'Ilhas Malvinas', 'FM': 'Micronésia',
        'FO': 'Ilhas Faroe', 'FR': 'França', 'GA': 'Gabão', 'GB': 'Reino Unido',
        'GD': 'Granada', 'GE': 'Geórgia', 'GF': 'Guiana Francesa', 'GG': 'Guernsey',
        'GH': 'Gana', 'GI': 'Gibraltar', 'GL': 'Groenlândia', 'GM': 'Gâmbia',
        'GN': 'Guiné', 'GP': 'Guadalupe', 'GQ': 'Guiné Equatorial', 'GR': 'Grécia',
        'GS': 'Geórgia do Sul', 'GT': 'Guatemala', 'GU': 'Guam', 'GW': 'Guiné-Bissau',
        'GY': 'Guiana', 'HK': 'Hong Kong', 'HM': 'Ilhas Heard', 'HN': 'Honduras',
        'HR': 'Croácia', 'HT': 'Haiti', 'HU': 'Hungria', 'ID': 'Indonésia',
        'IE': 'Irlanda', 'IL': 'Israel', 'IM': 'Ilha de Man', 'IN': 'Índia',
        'IO': 'Território Britânico do Oceano Índico', 'IQ': 'Iraque', 'IR': 'Irã', 'IS': 'Islândia',
        'IT': 'Itália', 'JE': 'Jersey', 'JM': 'Jamaica', 'JO': 'Jordânia',
        'JP': 'Japão', 'KE': 'Quênia', 'KG': 'Quirguistão', 'KH': 'Camboja',
        'KI': 'Kiribati', 'KM': 'Comores', 'KN': 'São Cristóvão', 'KP': 'Coreia do Norte',
        'KR': 'Coreia do Sul', 'KW': 'Kuwait', 'KY': 'Ilhas Cayman', 'KZ': 'Cazaquistão',
        'LA': 'Laos', 'LB': 'Líbano', 'LC': 'Santa Lúcia', 'LI': 'Liechtenstein',
        'LK': 'Sri Lanka', 'LR': 'Libéria', 'LS': 'Lesoto', 'LT': 'Lituânia',
        'LU': 'Luxemburgo', 'LV': 'Letônia', 'LY': 'Líbia', 'MA': 'Marrocos',
        'MC': 'Mônaco', 'MD': 'Moldávia', 'ME': 'Montenegro', 'MF': 'São Martinho',
        'MG': 'Madagascar', 'MH': 'Ilhas Marshall', 'MK': 'Macedônia do Norte', 'ML': 'Mali',
        'MM': 'Mianmar', 'MN': 'Mongólia', 'MO': 'Macau', 'MP': 'Ilhas Marianas',
        'MQ': 'Martinica', 'MR': 'Mauritânia', 'MS': 'Montserrat', 'MT': 'Malta',
        'MU': 'Maurício', 'MV': 'Maldivas', 'MW': 'Malawi', 'MX': 'México',
        'MY': 'Malásia', 'MZ': 'Moçambique', 'NA': 'Namíbia', 'NC': 'Nova Caledônia',
        'NE': 'Níger', 'NF': 'Ilha Norfolk', 'NG': 'Nigéria', 'NI': 'Nicarágua',
        'NL': 'Holanda', 'NO': 'Noruega', 'NP': 'Nepal', 'NR': 'Nauru',
        'NU': 'Niue', 'NZ': 'Nova Zelândia', 'OM': 'Omã', 'PA': 'Panamá',
        'PE': 'Peru', 'PF': 'Polinésia Francesa', 'PG': 'Papua Nova Guiné', 'PH': 'Filipinas',
        'PK': 'Paquistão', 'PL': 'Polônia', 'PM': 'São Pedro e Miquelão', 'PN': 'Ilhas Pitcairn',
        'PR': 'Porto Rico', 'PS': 'Palestina', 'PT': 'Portugal', 'PW': 'Palau',
        'PY': 'Paraguai', 'QA': 'Catar', 'RE': 'Reunião', 'RO': 'Romênia',
        'RS': 'Sérvia', 'RU': 'Rússia', 'RW': 'Ruanda', 'SA': 'Arábia Saudita',
        'SB': 'Ilhas Salomão', 'SC': 'Seicheles', 'SD': 'Sudão', 'SE': 'Suécia',
        'SG': 'Singapura', 'SH': 'Santa Helena', 'SI': 'Eslovênia', 'SJ': 'Svalbard',
        'SK': 'Eslováquia', 'SL': 'Serra Leoa', 'SM': 'San Marino', 'SN': 'Senegal',
        'SO': 'Somália', 'SR': 'Suriname', 'SS': 'Sudão do Sul', 'ST': 'São Tomé e Príncipe',
        'SV': 'El Salvador', 'SX': 'Sint Maarten', 'SY': 'Síria', 'SZ': 'Eswatini',
        'TC': 'Ilhas Turks e Caicos', 'TD': 'Chade', 'TF': 'Terras Austrais Francesas', 'TG': 'Togo',
        'TH': 'Tailândia', 'TJ': 'Tajiquistão', 'TK': 'Tokelau', 'TL': 'Timor-Leste',
        'TM': 'Turcomenistão', 'TN': 'Tunísia', 'TO': 'Tonga', 'TR': 'Turquia',
        'TT': 'Trinidad e Tobago', 'TV': 'Tuvalu', 'TW': 'Taiwan', 'TZ': 'Tanzânia',
        'UA': 'Ucrânia', 'UG': 'Uganda', 'UM': 'Ilhas Menores dos EUA', 'US': 'Estados Unidos',
        'UY': 'Uruguai', 'UZ': 'Uzbequistão', 'VA': 'Vaticano', 'VC': 'São Vicente e Granadinas',
        'VE': 'Venezuela', 'VG': 'Ilhas Virgens Britânicas', 'VI': 'Ilhas Virgens Americanas', 'VN': 'Vietnã',
        'VU': 'Vanuatu', 'WF': 'Wallis e Futuna', 'WS': 'Samoa', 'XK': 'Kosovo',
        'YE': 'Iêmen', 'YT': 'Mayotte', 'ZA': 'África do Sul', 'ZM': 'Zâmbia',
        'ZW': 'Zimbábue'
      },
      jobsByUF: {
        SP: 12543, RJ: 4567, MG: 3456, PR: 2345, DF: 2134, RS: 1876,
        BA: 1523, SC: 1543, PE: 1234, GO: 987, CE: 876, ES: 654,
        MS: 534, PA: 567, MT: 456, RN: 432, MA: 423, PB: 345,
        AM: 312, AL: 234, PI: 234, TO: 198, SE: 187, RO: 123,
        RR: 67, AC: 45, AP: 32
      },
      jobsByCountry: {
        BR: 35234, US: 8934, GB: 3456, PT: 2345, CA: 2134, DE: 1876,
        FR: 1234, ES: 1567, NL: 987, IE: 876, AU: 1234, IN: 2345,
        JP: 876, IL: 654, MX: 1876, AR: 1234, CO: 654, CL: 567,
        IT: 765, PL: 432, AE: 432, SG: 543, KR: 456, NZ: 345,
        CN: 234, RU: 123, ZA: 187, EG: 98, NG: 76
      },
      colorScale: {
        min: '#dbeafe',
        max: '#1e40af'
      },
      colorScaleDark: {
        min: '#1e3a8a',
        max: '#93c5fd'
      },
      defaultColor: '#e2e8f0',
      defaultColorDark: '#475569'
    }
  },
  computed: {
    isDarkTheme() {
      // Check if dark theme is active
      if (typeof document !== 'undefined') {
        const theme = document.documentElement.getAttribute('data-theme')
        if (theme === 'dark') return true
        if (theme === 'light') return false
        // Check system preference
        return window.matchMedia('(prefers-color-scheme: dark)').matches
      }
      return false
    },
    currentColorScale() {
      return this.isDarkTheme ? this.colorScaleDark : this.colorScale
    },
    currentDefaultColor() {
      return this.isDarkTheme ? this.defaultColorDark : this.defaultColor
    },
    strokeColor() {
      return this.isDarkTheme ? '#0f172a' : '#ffffff'
    },
    totalJobs() {
      if (this.activeMap === 'brazil') {
        return Object.values(this.jobsByUF).reduce((sum, jobs) => sum + jobs, 0)
      }
      return Object.values(this.jobsByCountry).reduce((sum, jobs) => sum + jobs, 0)
    },
    countriesWithJobs() {
      return Object.keys(this.jobsByCountry).filter(k => this.jobsByCountry[k] > 0).length
    },
    minJobs() {
      const values = Object.values(this.jobsByUF).filter(v => v > 0)
      return values.length > 0 ? Math.min(...values) : 0
    },
    maxJobs() {
      const values = Object.values(this.jobsByUF)
      return values.length > 0 ? Math.max(...values) : 1
    },
    worldMinJobs() {
      const values = Object.values(this.jobsByCountry).filter(v => v > 0)
      return values.length > 0 ? Math.min(...values) : 0
    },
    worldMaxJobs() {
      const values = Object.values(this.jobsByCountry)
      return values.length > 0 ? Math.max(...values) : 1
    }
  },
  mounted() {
    this.loadBrazilSvg()
    this.loadWorldSvg()
    this.setupThemeObserver()
  },
  beforeUnmount() {
    if (this.themeObserver) {
      this.themeObserver.disconnect()
    }
  },
  methods: {
    setupThemeObserver() {
      // Observe changes to the data-theme attribute
      this.themeObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.attributeName === 'data-theme') {
            this.reapplyMapStyles()
          }
        })
      })

      this.themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
      })

      // Also listen for system preference changes
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (!document.documentElement.getAttribute('data-theme')) {
          this.reapplyMapStyles()
        }
      })
    },
    reapplyMapStyles() {
      // Re-apply styles when theme changes
      const brazilSvg = this.$refs.brazilSvgContainer?.querySelector('svg')
      const worldSvg = this.$refs.worldSvgContainer?.querySelector('svg')

      if (brazilSvg) {
        this.applyBrazilStyles(brazilSvg)
      }
      if (worldSvg) {
        this.applyWorldStyles(worldSvg)
      }
    },
    switchMap(map) {
      if (map === this.activeMap) return

      this.isTransitioning = true
      this.previousMap = this.activeMap
      this.activeMap = map

      setTimeout(() => {
        this.isTransitioning = false
        this.previousMap = null
      }, 200)
    },
    async loadBrazilSvg() {
      try {
        const response = await fetch('/Brazil_states.svg')
        const svgText = await response.text()

        const container = this.$refs.brazilSvgContainer
        if (container) {
          container.innerHTML = svgText

          const svg = container.querySelector('svg')
          if (svg) {
            svg.setAttribute('width', '100%')
            svg.setAttribute('height', '100%')
            svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')

            this.applyBrazilStyles(svg)
            this.brazilSvgLoaded = true
          }
        }
      } catch (error) {
        console.error('Erro ao carregar SVG do Brasil:', error)
      }
    },
    async loadWorldSvg() {
      try {
        const response = await fetch('/world.svg')
        const svgText = await response.text()

        const container = this.$refs.worldSvgContainer
        if (container) {
          container.innerHTML = svgText

          const svg = container.querySelector('svg')
          if (svg) {
            const originalWidth = svg.getAttribute('width') || '1009.6727'
            const originalHeight = svg.getAttribute('height') || '665.96301'

            if (!svg.getAttribute('viewBox')) {
              svg.setAttribute('viewBox', `0 0 ${parseFloat(originalWidth)} ${parseFloat(originalHeight)}`)
            }

            svg.setAttribute('width', '100%')
            svg.setAttribute('height', '100%')
            svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')

            this.applyWorldStyles(svg)
            this.worldSvgLoaded = true
          }
        }
      } catch (error) {
        console.error('Erro ao carregar SVG do mundo:', error)
      }
    },
    applyBrazilStyles(svg) {
      const isDark = this.isDarkTheme
      // Contornos mais visíveis com melhor contraste
      const strokeColor = isDark ? '#0f172a' : '#ffffff'
      const strokeColorHover = isDark ? '#1e293b' : '#f8fafc'
      const hoverFilter = isDark ? 'brightness(1.2) saturate(1.1)' : 'brightness(0.9) saturate(1.05)'
      const baseStrokeWidth = '300'
      const hoverStrokeWidth = '450'

      Object.keys(this.stateMapping).forEach(svgId => {
        const stateGroup = svg.querySelector(`#${svgId}`)
        if (stateGroup) {
          const stateInfo = this.stateMapping[svgId]
          const jobs = this.jobsByUF[stateInfo.uf] || 0
          const color = this.getStateColor(jobs)

          const paths = stateGroup.querySelectorAll('path')
          paths.forEach(path => {
            path.style.fill = color
            path.style.stroke = strokeColor
            path.style.strokeWidth = baseStrokeWidth
            path.style.strokeLinejoin = 'round'
            path.style.strokeLinecap = 'round'
            path.style.transition = 'fill 0.2s ease, filter 0.2s ease, stroke 0.2s ease, stroke-width 0.2s ease'
            path.style.cursor = 'pointer'

            // Remove old listeners by cloning
            const newPath = path.cloneNode(true)
            path.parentNode.replaceChild(newPath, path)

            newPath.addEventListener('mouseenter', (e) => {
              this.onStateHover(e, stateInfo.name, jobs)
              newPath.style.filter = hoverFilter
              newPath.style.strokeWidth = hoverStrokeWidth
              newPath.style.stroke = strokeColorHover
            })

            newPath.addEventListener('mousemove', (e) => {
              this.moveTooltip(e)
            })

            newPath.addEventListener('mouseleave', () => {
              this.hideTooltip()
              newPath.style.filter = 'none'
              newPath.style.strokeWidth = baseStrokeWidth
              newPath.style.stroke = strokeColor
            })

            newPath.addEventListener('click', () => {
              this.$emit('selectUF', stateInfo.uf)
            })
          })
        }
      })
    },
    applyWorldStyles(svg) {
      const isDark = this.isDarkTheme
      // Contornos mais visíveis para o mapa do mundo
      const strokeColor = isDark ? '#0f172a' : '#ffffff'
      const strokeColorHover = isDark ? '#1e293b' : '#f8fafc'
      const defaultFill = isDark ? '#475569' : '#e2e8f0'
      const hoverFilter = isDark ? 'brightness(1.2) saturate(1.1)' : 'brightness(0.9) saturate(1.05)'
      const baseStrokeWidth = '0.6'
      const hoverStrokeWidth = '1.2'

      const paths = svg.querySelectorAll('path[id]')

      paths.forEach(path => {
        const countryCode = path.getAttribute('id')
        const countryName = this.countryMapping[countryCode] || path.getAttribute('title') || countryCode
        const jobs = this.jobsByCountry[countryCode] || 0
        const color = jobs > 0 ? this.getCountryColor(jobs) : defaultFill

        path.style.fill = color
        path.style.stroke = strokeColor
        path.style.strokeWidth = baseStrokeWidth
        path.style.strokeLinejoin = 'round'
        path.style.strokeLinecap = 'round'
        path.style.transition = 'fill 0.2s ease, filter 0.2s ease, stroke 0.2s ease, stroke-width 0.2s ease'
        path.style.cursor = 'pointer'

        // Remove old listeners by cloning
        const newPath = path.cloneNode(true)
        path.parentNode.replaceChild(newPath, path)

        newPath.addEventListener('mouseenter', (e) => {
          this.showTooltip(e, countryName, jobs)
          newPath.style.filter = hoverFilter
          newPath.style.strokeWidth = hoverStrokeWidth
          newPath.style.stroke = strokeColorHover
        })

        newPath.addEventListener('mousemove', (e) => {
          this.moveTooltip(e)
        })

        newPath.addEventListener('mouseleave', () => {
          this.hideTooltip()
          newPath.style.filter = 'none'
          newPath.style.strokeWidth = baseStrokeWidth
          newPath.style.stroke = strokeColor
        })

        newPath.addEventListener('click', () => {
          this.$emit('selectCountry', countryCode)
        })
      })
    },
    interpolateColor(color1, color2, factor) {
      const c1 = this.hexToRgb(color1)
      const c2 = this.hexToRgb(color2)

      const r = Math.round(c1.r + (c2.r - c1.r) * factor)
      const g = Math.round(c1.g + (c2.g - c1.g) * factor)
      const b = Math.round(c1.b + (c2.b - c1.b) * factor)

      return this.rgbToHex(r, g, b)
    },
    hexToRgb(hex) {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : { r: 0, g: 0, b: 0 }
    },
    rgbToHex(r, g, b) {
      return '#' + [r, g, b].map(x => {
        const hex = x.toString(16)
        return hex.length === 1 ? '0' + hex : hex
      }).join('')
    },
    getStateColor(jobs) {
      const scale = this.isDarkTheme ? this.colorScaleDark : this.colorScale
      if (jobs === 0) return scale.min
      const normalized = (jobs - this.minJobs) / (this.maxJobs - this.minJobs || 1)
      // Ajuste na curva para melhor distribuição de cores
      const logNormalized = Math.pow(normalized, 0.6)
      return this.interpolateColor(scale.min, scale.max, logNormalized)
    },
    getCountryColor(jobs) {
      const scale = this.isDarkTheme ? this.colorScaleDark : this.colorScale
      const defaultFill = this.isDarkTheme ? this.defaultColorDark : this.defaultColor
      if (jobs === 0) return defaultFill
      const normalized = (jobs - this.worldMinJobs) / (this.worldMaxJobs - this.worldMinJobs || 1)
      // Ajuste na curva para melhor distribuição de cores
      const logNormalized = Math.pow(normalized, 0.6)
      return this.interpolateColor(scale.min, scale.max, logNormalized)
    },
    onStateHover(event, name, jobs) {
      this.showTooltip(event, name, jobs)
    },
    showTooltip(event, name, jobs) {
      const section = this.$el.getBoundingClientRect()
      this.tooltip = {
        visible: true,
        x: event.clientX - section.left + 12,
        y: event.clientY - section.top - 48,
        name,
        jobs
      }
    },
    moveTooltip(event) {
      const section = this.$el.getBoundingClientRect()
      this.tooltip.x = event.clientX - section.left + 12
      this.tooltip.y = event.clientY - section.top - 48
    },
    hideTooltip() {
      this.tooltip.visible = false
    }
  }
}
</script>

<style scoped>
/* ==========================================================================
   Design Tokens
   ========================================================================== */

.coverage-section {
  /* Use global CSS variables with fallbacks */
  --c-bg: var(--color-surface, #f8fafc);
  --c-bg-glow: rgba(59, 130, 246, 0.08);
  --c-primary: var(--color-accent, #2563eb);
  --c-primary-dark: var(--color-accent-hover, #1e40af);
  --c-text: var(--color-text-primary, #0f172a);
  --c-text-muted: var(--color-text-muted, #64748b);
  --c-border: var(--color-border, #e2e8f0);
  --c-white: var(--color-background, #ffffff);
  --c-surface: var(--color-surface, #f8fafc);

  /* Legend gradient - light theme */
  --legend-gradient: linear-gradient(to right, #dbeafe, #60a5fa, #1e40af);

  --font-display: clamp(2rem, 4vw, 2.75rem);
  --font-subtitle: clamp(1rem, 2vw, 1.125rem);
  --font-metric: clamp(2.25rem, 5vw, 3.5rem);
  --font-label: clamp(0.8125rem, 1.5vw, 0.9375rem);
  --font-small: 0.8125rem;

  --space-section: clamp(4rem, 10vw, 8rem);
  --space-lg: clamp(2rem, 4vw, 3rem);
  --space-md: clamp(1rem, 2vw, 1.5rem);
  --space-sm: 0.75rem;

  --radius-lg: 1rem;
  --radius-md: 0.625rem;
  --radius-full: 9999px;

  --shadow-soft: var(--shadow-md, 0 4px 24px -4px rgba(0, 0, 0, 0.06));
  --shadow-glow: 0 0 120px 40px var(--c-bg-glow);

  --transition-fast: 150ms ease;
  --transition-base: 200ms ease;
}

/* Dark theme overrides for map section */
[data-theme="dark"] .coverage-section {
  --legend-gradient: linear-gradient(to right, #1e3a8a, #3b82f6, #93c5fd);
  --c-bg-glow: rgba(59, 130, 246, 0.15);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .coverage-section {
    --legend-gradient: linear-gradient(to right, #1e3a8a, #3b82f6, #93c5fd);
    --c-bg-glow: rgba(59, 130, 246, 0.15);
  }
}

/* ==========================================================================
   Section Layout
   ========================================================================== */

.coverage-section {
  position: relative;
  padding: var(--space-section) 0;
  background: var(--c-bg);
  overflow: hidden;
}

.coverage-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 80% 60% at 50% 40%, var(--color-accent-soft, rgba(219, 234, 254, 0.5)) 0%, transparent 70%),
    linear-gradient(180deg, var(--color-background, #ffffff) 0%, var(--c-bg) 100%);
  pointer-events: none;
  transition: background 0.3s ease;
}

/* Dark theme - subtle glow effect */
[data-theme="dark"] .coverage-bg {
  background:
    radial-gradient(ellipse 80% 60% at 50% 40%, rgba(59, 130, 246, 0.08) 0%, transparent 70%),
    linear-gradient(180deg, var(--color-background) 0%, var(--c-bg) 100%);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .coverage-bg {
    background:
      radial-gradient(ellipse 80% 60% at 50% 40%, rgba(59, 130, 246, 0.08) 0%, transparent 70%),
      linear-gradient(180deg, var(--color-background) 0%, var(--c-bg) 100%);
  }
}

.coverage-container {
  position: relative;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 clamp(1rem, 4vw, 2rem);
}

/* ==========================================================================
   Header
   ========================================================================== */

.coverage-header {
  text-align: center;
  margin-bottom: var(--space-lg);
}

.coverage-title {
  font-size: var(--font-display);
  font-weight: 700;
  color: var(--c-text);
  letter-spacing: -0.025em;
  line-height: 1.1;
  margin: 0 0 0.5rem;
}

.coverage-subtitle {
  font-size: var(--font-subtitle);
  color: var(--c-text-muted);
  margin: 0;
  font-weight: 400;
}

/* ==========================================================================
   Segmented Control
   ========================================================================== */

.coverage-controls {
  display: flex;
  justify-content: center;
  margin-bottom: var(--space-md);
}

.segmented-control {
  position: relative;
  display: inline-flex;
  background: var(--c-white);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-full);
  padding: 4px;
  box-shadow: var(--shadow-soft);
}

.segment {
  position: relative;
  z-index: 1;
  padding: 0.5rem 1.5rem;
  font-size: var(--font-small);
  font-weight: 500;
  color: var(--c-text-muted);
  background: transparent;
  border: none;
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: color var(--transition-fast);
}

.segment:hover {
  color: var(--c-text);
}

.segment.active {
  color: var(--c-white);
}

.segment-indicator {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 4px;
  width: calc(50% - 4px);
  background: var(--c-primary);
  border-radius: var(--radius-full);
  transition: transform var(--transition-base);
}

.segment-indicator.world {
  transform: translateX(100%);
}

/* ==========================================================================
   Metrics
   ========================================================================== */

.coverage-metrics {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(1.5rem, 4vw, 3rem);
  margin-bottom: var(--space-lg);
}

.metric {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.125rem;
}

.metric-value {
  font-size: var(--font-metric);
  font-weight: 700;
  color: var(--c-primary);
  letter-spacing: -0.03em;
  line-height: 1;
}

.metric-label {
  font-size: var(--font-label);
  color: var(--c-text-muted);
  font-weight: 400;
}

.metric-divider {
  width: 1px;
  height: 3rem;
  background: var(--c-border);
}

/* ==========================================================================
   Map Stage - Floating Effect
   ========================================================================== */

.map-stage {
  position: relative;
  width: 100%;
  max-width: 900px;
  margin: 0 auto var(--space-md);
}

.map-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 85%;
  height: 85%;
  background: radial-gradient(ellipse at center, var(--c-bg-glow) 0%, transparent 70%);
  filter: blur(50px);
  pointer-events: none;
  z-index: 0;
  transition: background 0.3s ease, filter 0.3s ease;
}

/* Enhanced glow for dark theme */
[data-theme="dark"] .map-glow {
  background: radial-gradient(ellipse at center, rgba(59, 130, 246, 0.2) 0%, transparent 65%);
  filter: blur(60px);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .map-glow {
    background: radial-gradient(ellipse at center, rgba(59, 130, 246, 0.2) 0%, transparent 65%);
    filter: blur(60px);
  }
}

.map-canvas {
  position: relative;
  z-index: 1;
  opacity: 0;
  transform: scale(0.98);
  transition:
    opacity var(--transition-base),
    transform var(--transition-base);
}

.map-canvas.active {
  opacity: 1;
  transform: scale(1);
}

.map-canvas.leaving {
  position: absolute;
  inset: 0;
  opacity: 0;
  transform: scale(0.98);
}

.svg-container {
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.brazil-svg :deep(svg) {
  width: 100%;
  max-width: 600px;
  height: auto;
}

.world-svg :deep(svg) {
  width: 100%;
  height: auto;
}

.brazil-svg :deep(svg path),
.world-svg :deep(svg path) {
  stroke-linejoin: round;
}

/* ==========================================================================
   Legend
   ========================================================================== */

.coverage-legend {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
}

.legend-label {
  font-size: var(--font-small);
  color: var(--c-text-muted);
}

.legend-gradient {
  width: clamp(120px, 20vw, 180px);
  height: 8px;
  border-radius: var(--radius-full);
  background: var(--legend-gradient);
  transition: background 0.3s ease;
}

/* ==========================================================================
   Tooltip
   ========================================================================== */

.map-tooltip {
  position: absolute;
  z-index: 100;
  background: var(--c-text);
  color: var(--c-white);
  padding: 0.625rem 0.875rem;
  border-radius: var(--radius-md);
  pointer-events: none;
  box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.3);
  white-space: nowrap;
  border: 1px solid var(--c-border);
  transition: background 0.3s ease, border-color 0.3s ease;
}

.tooltip-name {
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 2px;
}

.tooltip-value {
  display: block;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.8);
}

.tooltip-enter-active,
.tooltip-leave-active {
  transition: opacity 100ms ease, transform 100ms ease;
}

.tooltip-enter-from,
.tooltip-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

/* ==========================================================================
   Responsive
   ========================================================================== */

@media (max-width: 640px) {
  .coverage-metrics {
    gap: 1rem;
  }

  .metric-divider {
    height: 2.5rem;
  }

  .segment {
    padding: 0.5rem 1.25rem;
  }

  .map-stage {
    margin-bottom: var(--space-sm);
  }
}

/* ==========================================================================
   Touch Devices
   ========================================================================== */

@media (hover: none) and (pointer: coarse) {
  .map-tooltip {
    display: none;
  }
}
</style>
