import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { bootAuth } from './composables/useAuth'

// CSS global
import './assets/styles.css'

// Importar apenas os componentes do Ant Design que são realmente usados
// Isso reduz o bundle de ~400KB para ~50KB
import {
  Input,
  Select,
  DatePicker,
  Checkbox,
  Button,
  Divider,
  ConfigProvider
} from 'ant-design-vue'

// CSS reset mínimo do Ant Design
import 'ant-design-vue/es/style/reset.css'

// Tema customizado
import './assets/antd-theme.css'

// Camada de interacao e movimento
import './assets/motion.css'

// Camada de fisica-marca: pings, deteccoes, halos
import './assets/motion-sonar.css'

const app = createApp(App)

// Registrar apenas os componentes necessários
app.use(ConfigProvider)
app.use(Input)
app.use(Select)
app.use(DatePicker)
app.use(Checkbox)
app.use(Button)
app.use(Divider)

app.use(router)

// Hidrata sessão de auth ANTES do primeiro render. Sem isso, há janela
// curta onde components montam com isAuthenticated=false e disparam
// redirects defensivos (ex.: dashboard -> /login -> volta dashboard).
bootAuth().finally(() => {
  app.mount('#app')
})
