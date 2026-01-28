/**
 * Serviço de envio de vagas personalizadas para assinantes VIP
 * Envia vagas filtradas por stack para o privado dos assinantes
 *
 * REGRAS:
 * - Apenas 1 vaga enviada a cada 7 minutos por assinante
 * - Mesma vaga não é enviada duas vezes (exceto após 48 horas)
 * - Estado persistido em arquivo para sobreviver a reinicializações
 *
 * @author Sonar Bot
 */

import axios from "axios"
import { delay } from "baileys"
import { infoLog, infoLogAlways, successLog, warningLog, errorLog } from "../utils/logger.js"
import { BOT_EMOJI, TIMEOUT_IN_MILLISECONDS_BY_EVENT, CARD_API_URL } from "../config.js"
import { extractStack } from "./jobDistributor.js"
import { getVipSubscribers } from "../utils/database.js"
import { getCurrentSocket, isCurrentSocketReady } from "../utils/socketManager.js"
import { getAllJobs } from "./database.js"
import {
  canSendToSubscriber,
  wasJobSentRecently,
  recordJobSent,
  getTimeUntilCanSend,
  getSentJobIds,
  cleanOldEntries
} from "./vipHistory.js"

// Intervalo entre verificações (7 minutos)
const CHECK_INTERVAL = 7 * 60 * 1000
let vipTimeoutId = null
let vipIntervalId = null
let vipRunToken = 0
let vipPendingTimeoutId = null

// Buscas VIP pendentes quando a conexao esta fechada
const pendingVipSearches = new Map()

function queueVipSearch(lid, filters) {
  pendingVipSearches.set(lid, { filters, queuedAt: Date.now() })
}

async function processPendingVipSearches() {
  if (pendingVipSearches.size === 0) {
    return
  }

  for (const [lid, data] of pendingVipSearches.entries()) {
    const result = await triggerVipSearch(lid, data.filters, { allowQueue: false })

    if (result.success && (result.jobsFound === 0 || result.jobsSent > 0)) {
      pendingVipSearches.delete(lid)
    }

    await delay(1000)
  }
}

/**
 * Carrega as vagas direto do Supabase
 * @returns {Promise<Array>} Array de vagas
 */
async function loadJobs() {
  try {
    const jobs = await getAllJobs()
    return jobs || []
  } catch (err) {
    errorLog(`[VIP] Erro ao carregar vagas do Supabase: ${err.message}`)
    return []
  }
}

/**
 * Normaliza uma stack para comparação
 * Trata variações como "estagio", "estágio", "Estágio", etc.
 * @param {string} stack
 * @returns {string}
 */
function normalizeStack(stack) {
  return stack
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .trim()
}

/**
 * Verifica se a vaga corresponde aos filtros do assinante
 * Sistema INTELIGENTE de matching com:
 * - Threshold dinâmico (campos must = 100%, opcionais = flexível)
 * - Inferência semântica (Full Stack → backend + frontend)
 * - Tratamento especial para vagas 100% remotas
 * - Score graduado (exato > sinônimo > inferência)
 * - Filtro de idiomas funcional
 * - Fallback inteligente para maximizar matches
 *
 * @param {Object} job - Vaga
 * @param {Object} filters - Filtros do assinante
 * @returns {boolean|{match: boolean, score: number, details: Object}}
 */
function jobMatchesFilters(job, filters, returnScore = false) {
  // Se não tem filtros, aceita tudo (fallback inteligente)
  if (!filters || Object.keys(filters).length === 0) {
    return returnScore ? { match: true, score: 100, maxScore: 100, percentage: "100.0", details: { reason: "no_filters" } } : true
  }

  const jobTitle = normalizeStack(job.title || job.job_title || "")
  const jobDescription = normalizeStack(job.description || "")
  const jobUrl = normalizeStack(job.url || job.job_url || "")
  const jobSource = normalizeStack(job.source || "")
  const jobCompany = normalizeStack(job.company || "")
  const jobText = `${jobTitle} ${jobDescription} ${jobUrl} ${jobSource} ${jobCompany}`
  const jobLocation = normalizeStack(job.location || "")
  const jobWorkType = normalizeStack(job.work_type || "")
  const jobRegime = normalizeStack(job.hiring_regime || "")

  // Pesos padrão para cada categoria
  const weights = filters.weights || {
    roles: 20,
    stacks: 30,
    seniority: 15,
    locations: 10,
    workMode: 10,
    contract: 10,
    languages: 5
  }

  // Campos obrigatórios (must match)
  const must = filters.must || {
    roles: false,
    stacks: true,
    workMode: false,
    contract: false,
    languages: false,
    locations: false,
    seniority: false
  }

  // ═══════════════════════════════════════════════════════════════
  // SINÔNIMOS EXPANDIDOS + MÁXIMA COBERTURA
  // Sistema inteligente para nunca perder uma vaga relevante
  // ═══════════════════════════════════════════════════════════════
  const synonyms = {
    // ─────────────────────────────────────────────────────────────
    // SENIORITY - Todos os níveis e variações
    // ─────────────────────────────────────────────────────────────
    seniority: {
      "junior": ["junior", "jr", "jr.", "júnior", "nivel i", "nivel 1", "n1", "entry level", "entry-level", "iniciante", "associate", "i", "level 1", "l1", "p1", "grade 1", "g1", "beginning", "beginner", "novato", "junior i", "junior ii"],
      "pleno": ["pleno", "pl", "pl.", "mid", "mid-level", "middle", "nivel ii", "nivel 2", "n2", "intermediario", "ii", "level 2", "l2", "p2", "grade 2", "g2", "regular", "mid-senior", "semi-senior", "semi senior", "pleno i", "pleno ii", "pleno iii"],
      "senior": ["senior", "sr", "sr.", "sênior", "especialista", "nivel iii", "nivel 3", "n3", "expert", "iii", "level 3", "l3", "p3", "grade 3", "g3", "iv", "l4", "p4", "lead", "senior i", "senior ii", "senior iii", "avancado", "advanced", "experienced"],
      "staff": ["staff", "staff engineer", "staff developer", "l5", "p5", "level 5", "distinguished", "principal engineer", "principal", "fellow", "distinguished engineer", "staff software engineer"],
      "estagio": ["estagio", "estágio", "intern", "internship", "estagiario", "estagiária", "estagiario(a)", "summer intern", "intern developer"],
      "trainee": ["trainee", "aprendiz", "jovem aprendiz", "menor aprendiz", "apprentice", "graduate", "graduate program", "programa trainee"]
    },
    // ─────────────────────────────────────────────────────────────
    // WORK MODE - Modalidades de trabalho
    // ─────────────────────────────────────────────────────────────
    workMode: {
      "remoto": ["remoto", "remote", "home office", "trabalho remoto", "100% remoto", "anywhere", "full remote", "fully remote", "trabalho de casa", "wfh", "work from home", "a distancia", "remote first", "remote only", "worldwide", "global remote", "remote friendly", "distributed", "anywhere in"],
      "hibrido": ["hibrido", "híbrido", "hybrid", "semi-presencial", "semi presencial", "parcialmente remoto", "flexivel", "flexible", "2x presencial", "3x presencial", "4x presencial", "dias no escritorio", "part remote", "partial remote", "hybrid remote"],
      "presencial": ["presencial", "on-site", "onsite", "in-office", "no escritorio", "local", "in loco", "alocado", "office based", "office-based", "in person", "in-person", "at office"]
    },
    // ─────────────────────────────────────────────────────────────
    // CONTRACT - Tipos de contrato (Brasil + Internacional)
    // ─────────────────────────────────────────────────────────────
    contract: {
      "clt": ["clt", "efetivo", "carteira assinada", "regime clt", "contratacao clt", "clt flex", "contrato clt", "celetista", "full-time", "full time", "permanent", "permanente", "integral"],
      "pj": ["pj", "pessoa juridica", "pessoa jurídica", "freelance", "contractor", "contrato pj", "mei", "cnpj", "cooperado", "cooperativa", "autonomo", "autônomo", "prestador", "consultant", "consultoria", "self-employed", "independent contractor", "1099"],
      "estagio": ["estagio", "estágio", "intern", "internship", "contrato de estagio", "contrato estagio", "bolsa", "bolsista"],
      "temporario": ["temporario", "temporário", "temporary", "contract", "contrato temporario", "prazo determinado", "fixed term", "short term", "project based"],
      "terceirizado": ["terceirizado", "outsourcing", "outsourced", "alocado", "alocacao", "body shop", "staffing", "staff augmentation"]
    },
    // ─────────────────────────────────────────────────────────────
    // STACKS - Tecnologias (MASSIVAMENTE EXPANDIDO)
    // ─────────────────────────────────────────────────────────────
    stacks: {
      // Categorias gerais
      "frontend": ["frontend", "front-end", "front end", "client-side", "client side", "ui developer"],
      "backend": ["backend", "back-end", "back end", "server-side", "server side", "api developer"],
      "fullstack": ["fullstack", "full-stack", "full stack", "full-stack developer", "desenvolvedor fullstack", "generalista"],

      // Mobile
      "mobile": ["mobile", "android", "ios", "flutter", "react native", "mobile developer", "app", "aplicativo", "nativo", "native"],
      "ios": ["ios", "swift", "swiftui", "uikit", "objective-c", "objc", "xcode", "apple developer", "iphone", "ipad"],
      "android": ["android", "kotlin", "jetpack compose", "android studio", "google play", "android developer"],
      "flutter": ["flutter", "dart", "cross-platform", "cross platform"],
      "reactnative": ["react native", "react-native", "expo", "rn"],

      // JavaScript ecosystem
      "javascript": ["javascript", "js", "ecmascript", "es6", "es2020", "es2021", "es2022", "es2023", "vanilla js", "vanilla javascript"],
      "typescript": ["typescript", "ts", "typed javascript"],
      "node": ["node", "nodejs", "node.js", "express", "expressjs", "nestjs", "nest.js", "koa", "fastify", "hapi", "adonis", "adonisjs"],
      "react": ["react", "reactjs", "react.js", "next", "nextjs", "next.js", "redux", "react query", "tanstack", "remix", "gatsby", "create react app", "cra"],
      "angular": ["angular", "angularjs", "angular.js", "ngrx", "rxjs", "angular material"],
      "vue": ["vue", "vuejs", "vue.js", "nuxt", "nuxtjs", "vuex", "pinia", "vue router", "quasar"],
      "svelte": ["svelte", "sveltekit", "svelte kit"],

      // Python ecosystem
      "python": ["python", "django", "flask", "fastapi", "pandas", "numpy", "pytorch", "tensorflow", "scikit", "scikit-learn", "scipy", "matplotlib", "jupyter", "anaconda", "pip"],

      // Java ecosystem
      "java": ["java", "spring", "springboot", "spring boot", "maven", "gradle", "quarkus", "micronaut", "jvm", "jakarta", "hibernate", "jpa"],
      "spring": ["spring", "springboot", "spring boot", "spring framework", "spring cloud", "spring security", "spring data", "spring mvc", "spring webflux"],
      "kotlin": ["kotlin", "kotlinx", "ktor", "android kotlin", "kotlin multiplatform", "kmp"],
      "scala": ["scala", "akka", "play framework", "playframework", "spark scala", "cats", "zio"],

      // .NET ecosystem
      "csharp": ["c#", "csharp", ".net", "dotnet", "asp.net", "blazor", ".net core", "entity framework", "ef core", ".net 6", ".net 7", ".net 8", "maui", "xamarin", "wpf", "winforms"],

      // Other languages
      "go": ["go", "golang", "gin", "fiber", "echo", "gorilla", "beego"],
      "rust": ["rust", "rustlang", "actix", "axum", "rocket", "tokio", "wasm", "webassembly"],
      "php": ["php", "laravel", "symfony", "wordpress", "codeigniter", "yii", "drupal", "magento", "composer"],
      "ruby": ["ruby", "rails", "ruby on rails", "ror", "sinatra", "hanami"],
      "elixir": ["elixir", "phoenix", "ecto", "erlang", "otp", "beam"],
      "clojure": ["clojure", "clojurescript", "leiningen", "ring"],

      // Databases
      "sql": ["sql", "mysql", "postgresql", "postgres", "oracle", "sql server", "mssql", "database", "banco de dados", "mariadb", "sqlite", "rdbms", "relational"],
      "nosql": ["nosql", "mongodb", "mongo", "redis", "cassandra", "dynamodb", "couchdb", "firestore", "fauna", "faunadb"],
      "mongodb": ["mongodb", "mongo", "mongoose", "atlas"],
      "postgresql": ["postgresql", "postgres", "pg", "postgis"],
      "redis": ["redis", "memcached", "cache", "caching"],
      "elasticsearch": ["elasticsearch", "elastic", "opensearch", "lucene", "solr"],
      "neo4j": ["neo4j", "graph database", "graphdb", "cypher", "dgraph"],

      // DevOps & Cloud
      "devops": ["devops", "dev ops", "sre", "site reliability", "platform", "infrastructure", "infra", "devsecops"],
      "aws": ["aws", "amazon web services", "ec2", "s3", "lambda", "dynamodb", "rds", "cloudformation", "cdk", "eks", "ecs", "fargate", "sagemaker", "redshift"],
      "azure": ["azure", "microsoft azure", "azure devops", "azure functions", "aks", "cosmos db", "azure sql", "blob storage"],
      "gcp": ["gcp", "google cloud", "google cloud platform", "bigquery", "cloud run", "cloud functions", "gke", "dataflow", "pubsub"],
      "kubernetes": ["kubernetes", "k8s", "kube", "eks", "aks", "gke", "openshift", "helm", "kubectl", "k3s", "rancher"],
      "docker": ["docker", "container", "containerization", "dockerfile", "docker-compose", "docker compose", "podman", "containerd"],
      "terraform": ["terraform", "tf", "iac", "infrastructure as code", "terragrunt", "pulumi", "cloudformation"],
      "cicd": ["ci/cd", "cicd", "github actions", "gitlab ci", "jenkins", "circleci", "travis", "azure pipelines", "bitbucket pipelines", "drone", "argocd", "argo cd", "gitops"],
      "ansible": ["ansible", "playbook", "puppet", "chef", "saltstack"],

      // Monitoring & Observability
      "monitoring": ["prometheus", "grafana", "datadog", "newrelic", "new relic", "splunk", "dynatrace", "observability", "apm", "elk", "logstash", "kibana"],

      // Data & Analytics
      "data": ["data", "dados", "data science", "data engineer", "cientista de dados", "machine learning", "ml", "ai", "big data", "analytics", "bi", "etl", "dataops", "spark", "hadoop", "databricks", "snowflake", "dbt", "airflow"],
      "machinelearning": ["machine learning", "ml", "deep learning", "neural network", "ai", "artificial intelligence", "nlp", "computer vision", "reinforcement learning"],
      "llm": ["llm", "large language model", "chatgpt", "openai", "claude", "gpt", "langchain", "huggingface", "transformers", "genai", "gen ai", "generative ai", "prompt engineering"],

      // QA & Testing
      "qa": ["qa", "quality", "teste", "tester", "testing", "qualidade", "automacao", "quality assurance", "sdet", "test engineer", "test automation"],
      "testing": ["jest", "vitest", "cypress", "playwright", "selenium", "webdriver", "pytest", "junit", "testng", "mocha", "chai", "jasmine", "karma", "e2e", "unit test", "integration test"],

      // Design
      "design": ["design", "designer", "ux", "ui", "ux/ui", "ui/ux", "product design", "grafico", "figma", "sketch", "adobe xd", "invision", "zeplin", "framer"],

      // APIs & Communication
      "api": ["api", "rest", "restful", "graphql", "grpc", "soap", "openapi", "swagger", "postman", "insomnia"],
      "graphql": ["graphql", "apollo", "hasura", "relay", "graph ql"],
      "websocket": ["websocket", "socket.io", "ws", "real-time", "realtime", "sse", "server-sent events"],
      "kafka": ["kafka", "apache kafka", "confluent", "event streaming", "event-driven"],
      "rabbitmq": ["rabbitmq", "rabbit mq", "amqp", "message queue", "message broker"],

      // Specialty stacks
      "blockchain": ["blockchain", "web3", "solidity", "ethereum", "smart contract", "crypto", "defi", "nft", "hardhat", "truffle"],
      "gamedev": ["unity", "unity3d", "unreal", "unreal engine", "ue4", "ue5", "game dev", "game development", "godot", "c++ games"],
      "embedded": ["embedded", "iot", "arduino", "raspberry pi", "firmware", "rtos", "microcontroller", "plc"],
      "security": ["security", "cybersecurity", "infosec", "appsec", "pentesting", "penetration testing", "soc", "siem", "owasp"],

      // Low-code / No-code
      "lowcode": ["n8n", "make", "integromat", "zapier", "power automate", "appsmith", "retool", "budibase", "webflow", "bubble", "airtable"],

      // Enterprise
      "salesforce": ["salesforce", "sfdc", "apex", "lightning", "salesforce developer"],
      "sap": ["sap", "abap", "hana", "sap developer", "sap consultant"]
    },
    // ─────────────────────────────────────────────────────────────
    // ROLES - Cargos e funções (EXPANDIDO)
    // ─────────────────────────────────────────────────────────────
    roles: {
      "desenvolvedor": ["desenvolvedor", "developer", "dev", "programador", "engineer", "engenheiro", "software engineer", "software developer", "swe", "coder", "programmer"],
      "analista": ["analista", "analyst", "analista de sistemas", "systems analyst", "analista de ti", "it analyst", "analista de desenvolvimento"],
      "tech lead": ["tech lead", "lider tecnico", "lider de tecnologia", "technical lead", "lead developer", "lead engineer", "engineering lead", "team lead", "squad lead"],
      "arquiteto": ["arquiteto", "architect", "solution architect", "software architect", "solutions architect", "cloud architect", "enterprise architect", "system architect"],
      "gerente": ["gerente", "manager", "coordenador", "head", "diretor", "supervisor", "engineering manager", "em", "head of engineering", "development manager"],
      "backend": ["backend", "back-end", "back end", "desenvolvedor backend", "backend developer", "backend engineer", "server-side developer"],
      "frontend": ["frontend", "front-end", "front end", "desenvolvedor frontend", "frontend developer", "frontend engineer", "ui developer", "web developer"],
      "fullstack": ["fullstack", "full-stack", "full stack", "desenvolvedor fullstack", "fullstack developer", "fullstack engineer"],
      "mobile": ["mobile developer", "desenvolvedor mobile", "mobile engineer", "app developer", "ios developer", "android developer"],
      "product": ["product manager", "pm", "product owner", "po", "gerente de produto", "product lead"],
      "devops": ["devops engineer", "sre", "platform engineer", "infrastructure engineer", "cloud engineer", "reliability engineer", "site reliability engineer"],
      "data_scientist": ["data scientist", "cientista de dados", "ml engineer", "machine learning engineer", "ai engineer", "research scientist", "pesquisador", "research engineer"],
      "data_engineer": ["data engineer", "engenheiro de dados", "analytics engineer", "bi developer", "etl developer", "dataops engineer", "data platform engineer"],
      "security": ["security engineer", "appsec", "infosec", "cybersecurity engineer", "security analyst", "soc analyst", "devsecops", "pentester", "engenheiro de seguranca"],
      "ux_designer": ["ux designer", "ui designer", "product designer", "designer de produto", "ux researcher", "ui/ux designer", "ux/ui designer", "interaction designer"],
      "scrum": ["scrum master", "agile coach", "agile master", "kanban master", "delivery manager"],
      "executive": ["cto", "vp engineering", "vpe", "engineering director", "head of engineering", "chief architect", "cio", "tech director", "diretor de tecnologia"]
    },
    // ─────────────────────────────────────────────────────────────
    // LANGUAGES - Idiomas (COMPLETO)
    // ─────────────────────────────────────────────────────────────
    languages: {
      "pt": ["portugues", "portuguese", "pt-br", "pt_br", "brasil", "brasileiro", "fluente portugues", "nativo portugues", "portuguese native", "portuguese fluent", "lingua portuguesa"],
      "en": ["ingles", "english", "en-us", "en_us", "fluent english", "inglês fluente", "english native", "inglês nativo", "intermediate english", "ingles intermediario", "advanced english", "ingles avancado", "conversational english"],
      "es": ["espanhol", "spanish", "español", "castellano", "espanol", "spanish fluent"],
      "fr": ["frances", "french", "français", "francais", "francês"],
      "de": ["alemao", "german", "deutsch", "alemão", "deutsche"],
      "it": ["italiano", "italian", "italiana"],
      "zh": ["chines", "chinese", "mandarin", "mandarim", "中文", "putonghua"],
      "ja": ["japones", "japanese", "日本語", "nihongo", "japonês"],
      "ko": ["coreano", "korean", "한국어", "hangul"]
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // INFERÊNCIAS SEMÂNTICAS - MASSIVAMENTE EXPANDIDO
  // Mapeia frameworks/ferramentas para tecnologias base
  // ═══════════════════════════════════════════════════════════════
  const semanticInferences = {
    // Full Stack
    "fullstack": ["backend", "frontend"],
    "full-stack": ["backend", "frontend"],
    "full stack": ["backend", "frontend"],
    "mern": ["mongodb", "express", "react", "node", "javascript"],
    "mean": ["mongodb", "express", "angular", "node", "javascript"],
    "lamp": ["linux", "apache", "mysql", "php"],
    "jamstack": ["javascript", "api", "frontend"],

    // Java ecosystem
    "spring": ["java"],
    "springboot": ["java"],
    "spring boot": ["java"],
    "quarkus": ["java"],
    "micronaut": ["java"],
    "hibernate": ["java", "sql"],
    "maven": ["java"],
    "gradle": ["java", "kotlin"],

    // Python ecosystem
    "django": ["python"],
    "flask": ["python"],
    "fastapi": ["python"],
    "pandas": ["python", "data"],
    "numpy": ["python", "data"],
    "pytorch": ["python", "machine learning"],
    "tensorflow": ["python", "machine learning"],
    "scikit": ["python", "machine learning"],
    "airflow": ["python", "data", "etl"],
    "sqlalchemy": ["python", "database"],

    // JavaScript/Node ecosystem
    "react native": ["javascript", "mobile", "react"],
    "next.js": ["react", "javascript", "typescript"],
    "nextjs": ["react", "javascript", "typescript"],
    "gatsby": ["react", "javascript", "graphql"],
    "remix": ["react", "javascript", "typescript"],
    "nuxt": ["vue", "javascript"],
    "nuxtjs": ["vue", "javascript"],
    "nestjs": ["node", "typescript"],
    "express": ["node", "javascript"],
    "fastify": ["node", "javascript"],
    "koa": ["node", "javascript"],
    "prisma": ["typescript", "node", "database"],
    "typeorm": ["typescript", "node", "database"],
    "sequelize": ["javascript", "node", "database"],
    "mongoose": ["javascript", "node", "mongodb"],

    // Frontend
    "angular": ["typescript", "frontend"],
    "vue": ["javascript", "frontend"],
    "svelte": ["javascript", "frontend"],
    "sveltekit": ["javascript", "typescript", "frontend"],
    "vite": ["javascript", "typescript", "frontend"],
    "webpack": ["javascript", "frontend"],

    // Mobile
    "flutter": ["mobile", "dart"],
    "expo": ["react native", "javascript", "mobile"],
    "swiftui": ["swift", "ios", "mobile"],
    "jetpack compose": ["kotlin", "android", "mobile"],
    "xamarin": ["csharp", "mobile"],

    // .NET ecosystem
    ".net": ["csharp"],
    "blazor": ["csharp", "frontend"],
    "asp.net": ["csharp"],
    "entity framework": ["csharp", "database"],
    "maui": ["csharp", "mobile"],

    // Ruby ecosystem
    "rails": ["ruby"],
    "ruby on rails": ["ruby"],
    "sinatra": ["ruby"],

    // PHP ecosystem
    "laravel": ["php"],
    "symfony": ["php"],
    "wordpress": ["php"],
    "eloquent": ["php", "laravel", "database"],

    // Go ecosystem
    "gin": ["go"],
    "fiber": ["go"],
    "echo": ["go"],

    // Rust ecosystem
    "actix": ["rust"],
    "axum": ["rust"],
    "rocket": ["rust"],
    "tokio": ["rust"],

    // Elixir/Erlang
    "phoenix": ["elixir"],
    "ecto": ["elixir", "database"],

    // Kotlin
    "ktor": ["kotlin"],

    // DevOps & Cloud
    "terraform": ["devops", "infrastructure", "cloud"],
    "kubernetes": ["devops", "docker", "cloud"],
    "k8s": ["devops", "docker", "cloud", "kubernetes"],
    "docker": ["devops", "infrastructure"],
    "aws": ["cloud", "devops"],
    "azure": ["cloud", "devops"],
    "gcp": ["cloud", "devops"],
    "github actions": ["devops", "cicd"],
    "gitlab ci": ["devops", "cicd"],
    "jenkins": ["devops", "cicd"],
    "argocd": ["devops", "kubernetes", "gitops"],
    "helm": ["kubernetes", "devops"],

    // Data & AI
    "spark": ["data", "big data", "python", "scala"],
    "hadoop": ["data", "big data"],
    "databricks": ["data", "spark", "cloud"],
    "snowflake": ["data", "sql", "cloud"],
    "dbt": ["data", "analytics", "sql"],
    "bigquery": ["data", "sql", "gcp"],
    "redshift": ["data", "sql", "aws"],
    "langchain": ["python", "ai", "llm"],
    "huggingface": ["python", "machine learning", "ai"],

    // Testing
    "jest": ["javascript", "testing"],
    "vitest": ["javascript", "typescript", "testing"],
    "cypress": ["javascript", "testing", "e2e"],
    "playwright": ["javascript", "typescript", "testing", "e2e"],
    "pytest": ["python", "testing"],
    "junit": ["java", "testing"],
    "rspec": ["ruby", "testing"],
    "selenium": ["testing", "e2e", "qa"],

    // APIs
    "graphql": ["api"],
    "apollo": ["graphql", "javascript"],
    "hasura": ["graphql", "database"],

    // Databases
    "mongodb": ["nosql", "database"],
    "postgresql": ["sql", "database"],
    "mysql": ["sql", "database"],
    "redis": ["nosql", "cache", "database"],
    "elasticsearch": ["search", "database"],
    "neo4j": ["graph", "database"],
    "dynamodb": ["nosql", "aws", "database"],
    "cosmos db": ["nosql", "azure", "database"],

    // Message queues
    "kafka": ["event-driven", "messaging"],
    "rabbitmq": ["messaging", "queue"]
  }

  // ═══════════════════════════════════════════════════════════════
  // GRUPOS DE TECNOLOGIAS - Para matching por categoria
  // ═══════════════════════════════════════════════════════════════
  const technologyGroups = {
    "relational_db": ["sql", "mysql", "postgresql", "postgres", "oracle", "sql server", "mariadb", "sqlite"],
    "nosql_db": ["mongodb", "cassandra", "dynamodb", "couchdb", "redis", "firestore", "fauna"],
    "cloud": ["aws", "azure", "gcp", "digitalocean", "heroku", "vercel", "netlify"],
    "containers": ["docker", "kubernetes", "podman", "containerd"],
    "cicd": ["github actions", "gitlab ci", "jenkins", "circleci", "travis", "azure devops"],
    "monitoring": ["prometheus", "grafana", "datadog", "newrelic", "splunk", "elastic"],
    "frontend_framework": ["react", "angular", "vue", "svelte", "solid"],
    "backend_lang": ["java", "python", "node", "go", "rust", "php", "ruby", "csharp", "kotlin", "scala", "elixir"]
  }

  // ═══════════════════════════════════════════════════════════════
  // CORREÇÃO DE TYPOS COMUNS
  // ═══════════════════════════════════════════════════════════════
  const commonTypos = {
    "javascrip": "javascript", "javasript": "javascript", "javscript": "javascript",
    "typescrip": "typescript", "typscript": "typescript",
    "phyton": "python", "pyhton": "python", "pytohn": "python",
    "developper": "developer", "develper": "developer",
    "desenvoledor": "desenvolvedor", "desenvolvedro": "desenvolvedor",
    "engenehiro": "engenheiro", "engenhero": "engenheiro",
    "seniro": "senior", "senir": "senior",
    "junio": "junior", "júnio": "junior",
    "postgress": "postgresql", "postgressql": "postgresql",
    "kubernets": "kubernetes", "kubernates": "kubernetes",
    "angualr": "angular", "anglar": "angular",
    "recat": "react", "raect": "react"
  }

  // ═══════════════════════════════════════════════════════════════
  // DETECÇÃO INTELIGENTE DE PAÍS
  // ═══════════════════════════════════════════════════════════════
  const countryKeywords = {
    brasil: ["brasil", "brazil", "br", "sao paulo", "rio de janeiro", "belo horizonte", "curitiba", "porto alegre", "salvador", "recife", "fortaleza", "brasilia"],
    eua: ["usa", "eua", "estados unidos", "united states", "us", "new york", "california", "texas", "florida", "seattle", "san francisco", "silicon valley"],
    canada: ["canada", "canadá", "toronto", "vancouver", "montreal"],
    portugal: ["portugal", "pt", "lisboa", "porto"],
    alemanha: ["alemanha", "germany", "deutschland", "berlin", "munich", "frankfurt"],
    reino_unido: ["uk", "united kingdom", "reino unido", "england", "inglaterra", "london", "manchester"],
    espanha: ["espanha", "spain", "españa", "madrid", "barcelona"],
    franca: ["franca", "france", "frança", "paris", "lyon"],
    holanda: ["holanda", "netherlands", "paises baixos", "amsterdam", "rotterdam"],
    irlanda: ["irlanda", "ireland", "dublin"],
    argentina: ["argentina", "buenos aires"],
    chile: ["chile", "santiago"],
    mexico: ["mexico", "méxico", "ciudad de mexico"],
    colombia: ["colombia", "colômbia", "bogota", "medellin"],
    india: ["india", "índia", "bangalore", "mumbai", "delhi"],
    australia: ["australia", "austrália", "sydney", "melbourne"]
  }

  // ═══════════════════════════════════════════════════════════════
  // FUNÇÕES AUXILIARES
  // ═══════════════════════════════════════════════════════════════

  // Detecta país do usuário
  const getUserCountry = (locs) => {
    for (const loc of locs) {
      const normalized = normalizeStack(loc)
      for (const [country, keywords] of Object.entries(countryKeywords)) {
        if (keywords.some(kw => normalized.includes(kw) || kw.includes(normalized))) {
          return country
        }
      }
    }
    return null
  }

  // Detecta país da vaga
  const getJobCountry = (jobLoc) => {
    const normalized = normalizeStack(jobLoc)
    for (const [country, keywords] of Object.entries(countryKeywords)) {
      if (keywords.some(kw => normalized.includes(kw))) {
        return country
      }
    }
    return null
  }

  // Verifica se a vaga é 100% remota
  const isFullyRemote = (workType, text) => {
    const remoteKeywords = ["100% remoto", "full remote", "fully remote", "remote anywhere", "worldwide remote", "global remote", "trabalho remoto", "remote first"]
    const combined = `${workType} ${text}`.toLowerCase()
    return remoteKeywords.some(kw => combined.includes(kw)) ||
           (combined.includes("remote") && !combined.includes("hybrid") && !combined.includes("hibrido"))
  }

  // Aplica correção de typos ao texto
  const fixTypos = (text) => {
    let fixed = text
    for (const [typo, correction] of Object.entries(commonTypos)) {
      if (fixed.includes(typo)) {
        fixed = fixed.replace(new RegExp(typo, 'g'), correction)
      }
    }
    return fixed
  }

  // Aplica inferências semânticas ao texto da vaga
  const applyInferences = (text) => {
    let expandedText = text
    for (const [term, implications] of Object.entries(semanticInferences)) {
      if (text.includes(term)) {
        expandedText += " " + implications.join(" ")
      }
    }
    return expandedText
  }

  // Verifica se o termo pertence a um grupo de tecnologias
  const getTermGroup = (term) => {
    for (const [groupName, members] of Object.entries(technologyGroups)) {
      if (members.includes(term)) {
        return { groupName, members }
      }
    }
    return null
  }

  // Função de match com scoring graduado
  // PESOS: exato=100%, synonym=90%, typo=85%, inference=75%, group=60%
  const checkMatchWithScore = (terms, text, synonymGroup, weight) => {
    if (!terms || terms.length === 0) return { matched: true, isEmpty: true, matchType: "none", score: 0 }

    // Aplica correção de typos ao texto da vaga
    const fixedText = fixTypos(text)
    const expandedText = applyInferences(fixedText)
    let bestMatch = { matched: false, isEmpty: false, matchType: "none", score: 0 }

    for (const term of terms) {
      const normalized = normalizeStack(term)
      const fixedNormalized = fixTypos(normalized)

      // 1. Match EXATO (100% do peso)
      if (fixedText.includes(normalized)) {
        return { matched: true, isEmpty: false, matchType: "exact", score: weight }
      }

      // 2. Match por SINÔNIMO (90% do peso)
      if (synonymGroup) {
        for (const [key, syns] of Object.entries(synonymGroup)) {
          if (normalized === key || syns.includes(normalized)) {
            if (syns.some(s => fixedText.includes(s))) {
              if (bestMatch.score < weight * 0.9) {
                bestMatch = { matched: true, isEmpty: false, matchType: "synonym", score: weight * 0.9 }
              }
            }
          }
        }
      }

      // 3. Match por CORREÇÃO DE TYPO (85% do peso)
      if (fixedNormalized !== normalized && fixedText.includes(fixedNormalized)) {
        if (bestMatch.score < weight * 0.85) {
          bestMatch = { matched: true, isEmpty: false, matchType: "typo_corrected", score: weight * 0.85 }
        }
      }

      // 4. Match por INFERÊNCIA SEMÂNTICA (75% do peso)
      if (expandedText.includes(normalized) && !fixedText.includes(normalized)) {
        if (bestMatch.score < weight * 0.75) {
          bestMatch = { matched: true, isEmpty: false, matchType: "inference", score: weight * 0.75 }
        }
      }

      // 5. Match por GRUPO de tecnologias (60% do peso)
      const group = getTermGroup(normalized)
      if (group && bestMatch.score < weight * 0.6) {
        const groupMatch = group.members.some(member => fixedText.includes(member))
        if (groupMatch) {
          bestMatch = { matched: true, isEmpty: false, matchType: "group", score: weight * 0.6, group: group.groupName }
        }
      }
    }

    return bestMatch
  }

  // Função de match simples (sem scoring)
  const checkMatch = (terms, text, synonymGroup) => {
    const result = checkMatchWithScore(terms, text, synonymGroup, 1)
    return { matched: result.matched, isEmpty: result.isEmpty }
  }

  // ═══════════════════════════════════════════════════════════════
  // LÓGICA DE MATCHING
  // ═══════════════════════════════════════════════════════════════

  let totalScore = 0
  let maxScore = 0
  let mustFieldsFailed = false
  const matchDetails = {}

  // ─────────────────────────────────────────────────────────────
  // 1. STACKS (peso: weights.stacks)
  // ─────────────────────────────────────────────────────────────
  const stacks = filters.stacks || []
  if (stacks.length > 0) {
    maxScore += weights.stacks
    const stackResult = checkMatchWithScore(stacks, jobText, synonyms.stacks, weights.stacks)
    matchDetails.stacks = stackResult

    if (stackResult.matched && !stackResult.isEmpty) {
      totalScore += stackResult.score
    } else if (must.stacks) {
      mustFieldsFailed = true
      matchDetails.failReason = "stacks_required_not_found"
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 2. ROLES (peso: weights.roles)
  // ─────────────────────────────────────────────────────────────
  const roles = filters.roles || []
  if (roles.length > 0) {
    maxScore += weights.roles
    const roleResult = checkMatchWithScore(roles, jobText, synonyms.roles, weights.roles)
    matchDetails.roles = roleResult

    if (roleResult.matched && !roleResult.isEmpty) {
      totalScore += roleResult.score
    } else if (must.roles) {
      mustFieldsFailed = true
      matchDetails.failReason = "roles_required_not_found"
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 3. SENIORITY (peso: weights.seniority)
  // ─────────────────────────────────────────────────────────────
  const seniority = filters.seniority || []
  if (seniority.length > 0) {
    maxScore += weights.seniority
    const seniorityResult = checkMatchWithScore(seniority, jobText, synonyms.seniority, weights.seniority)
    matchDetails.seniority = seniorityResult

    if (seniorityResult.matched && !seniorityResult.isEmpty) {
      totalScore += seniorityResult.score
    } else if (must.seniority) {
      mustFieldsFailed = true
      matchDetails.failReason = "seniority_required_not_found"
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 4. EXCLUDE SENIORITY (hard reject)
  // ─────────────────────────────────────────────────────────────
  const excludeSeniority = filters.excludeSeniority || []
  if (excludeSeniority.length > 0) {
    const excludeResult = checkMatch(excludeSeniority, jobText, synonyms.seniority)
    if (excludeResult.matched && !excludeResult.isEmpty) {
      matchDetails.failReason = "excluded_seniority_found"
      return returnScore ? { match: false, score: 0, maxScore, percentage: "0", details: matchDetails } : false
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 5. WORK MODE (peso: weights.workMode)
  // Com tratamento especial para vagas 100% remotas
  // ─────────────────────────────────────────────────────────────
  const workMode = filters.workMode || []
  const jobIsFullyRemote = isFullyRemote(jobWorkType, jobText)

  if (workMode.length > 0) {
    maxScore += weights.workMode
    const workText = `${jobWorkType} ${jobText}`
    const workResult = checkMatchWithScore(workMode, workText, synonyms.workMode, weights.workMode)
    matchDetails.workMode = { ...workResult, isFullyRemote: jobIsFullyRemote }

    if (workResult.matched && !workResult.isEmpty) {
      totalScore += workResult.score
    } else if (must.workMode) {
      mustFieldsFailed = true
      matchDetails.failReason = "workMode_required_not_found"
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 6. CONTRACT (peso: weights.contract)
  // ─────────────────────────────────────────────────────────────
  const contract = filters.contract || []
  if (contract.length > 0) {
    maxScore += weights.contract
    const contractText = `${jobRegime} ${jobText}`
    const contractResult = checkMatchWithScore(contract, contractText, synonyms.contract, weights.contract)
    matchDetails.contract = contractResult

    if (contractResult.matched && !contractResult.isEmpty) {
      totalScore += contractResult.score
    } else if (must.contract) {
      mustFieldsFailed = true
      matchDetails.failReason = "contract_required_not_found"
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 7. LANGUAGES (peso: weights.languages) - AGORA FUNCIONA!
  // ─────────────────────────────────────────────────────────────
  const languages = filters.languages || []
  if (languages.length > 0) {
    maxScore += weights.languages
    const langResult = checkMatchWithScore(languages, jobText, synonyms.languages, weights.languages)
    matchDetails.languages = langResult

    if (langResult.matched && !langResult.isEmpty) {
      totalScore += langResult.score
    } else if (must.languages) {
      mustFieldsFailed = true
      matchDetails.failReason = "languages_required_not_found"
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 8. LOCATIONS (peso: weights.locations)
  // Com lógica inteligente de país + tratamento de remoto global
  // ─────────────────────────────────────────────────────────────
  const locations = filters.locations || []
  if (locations.length > 0) {
    maxScore += weights.locations

    const userCountry = getUserCountry(locations)
    const jobCountry = getJobCountry(job.location || "")

    matchDetails.locations = {
      userCountry,
      jobCountry,
      jobLocation: job.location,
      isFullyRemote: jobIsFullyRemote
    }

    // LÓGICA INTELIGENTE:
    // Se a vaga é 100% remota E o usuário aceita remoto → ignora país
    const userAcceptsRemote = workMode.some(wm =>
      normalizeStack(wm) === "remoto" || normalizeStack(wm) === "remote"
    )

    if (jobIsFullyRemote && userAcceptsRemote) {
      // Vaga 100% remota + usuário aceita remoto = ACEITA independente do país
      totalScore += weights.locations
      matchDetails.locations.bypassedDueToRemote = true
    } else if (userCountry && jobCountry && userCountry !== jobCountry) {
      // País diferente e não é remoto global = REJEITA
      matchDetails.failReason = "different_country"
      return returnScore ? { match: false, score: 0, maxScore, percentage: "0", details: matchDetails } : false
    } else {
      // Verifica match normal de localização
      const locationMatch = locations.some(loc => {
        const normalized = normalizeStack(loc)
        return jobLocation.includes(normalized) || jobText.includes(normalized)
      })

      if (locationMatch) {
        totalScore += weights.locations
        matchDetails.locations.matched = true
      } else if (must.locations) {
        mustFieldsFailed = true
        matchDetails.failReason = "locations_required_not_found"
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 9. VALIDAÇÃO FINAL
  // ─────────────────────────────────────────────────────────────

  // Se algum campo obrigatório falhou, rejeita
  if (mustFieldsFailed) {
    return returnScore ? { match: false, score: totalScore, maxScore, percentage: maxScore > 0 ? (totalScore / maxScore * 100).toFixed(1) : "0", details: matchDetails } : false
  }

  // Precisa ter pelo menos uma stack ou role definida
  if (stacks.length === 0 && roles.length === 0) {
    matchDetails.failReason = "no_stacks_or_roles_defined"
    return returnScore ? { match: false, score: 0, maxScore, percentage: "0", details: matchDetails } : false
  }

  // ─────────────────────────────────────────────────────────────
  // 10. THRESHOLD DINÂMICO
  // Base: 50% para ser mais flexível
  // Mas campos "must" já foram verificados acima (100% obrigatório)
  // ─────────────────────────────────────────────────────────────
  const dynamicThreshold = 0.5 // 50% base (mais flexível que 70%)
  const minScore = maxScore * dynamicThreshold
  const matched = maxScore === 0 || totalScore >= minScore

  matchDetails.threshold = {
    dynamic: dynamicThreshold,
    minRequired: minScore,
    achieved: totalScore
  }

  if (returnScore) {
    return {
      match: matched,
      score: totalScore,
      maxScore,
      percentage: maxScore > 0 ? (totalScore / maxScore * 100).toFixed(1) : "0",
      details: matchDetails
    }
  }

  return matched
}

/**
 * Verifica se a vaga corresponde às stacks do assinante (compatibilidade legada)
 * @param {Object} job - Vaga
 * @param {string[]|Object} stacksOrFilters - Stacks do assinante ou objeto de filtros
 * @returns {boolean}
 */
function jobMatchesStacks(job, stacksOrFilters) {
  // Se recebeu um objeto de filtros, usa a nova função
  if (stacksOrFilters && typeof stacksOrFilters === 'object' && !Array.isArray(stacksOrFilters)) {
    return jobMatchesFilters(job, stacksOrFilters)
  }

  // Se recebeu array de stacks, converte para filtros
  const filters = { stacks: stacksOrFilters || [] }
  return jobMatchesFilters(job, filters)
}

/**
 * Formata a mensagem da vaga para envio no privado
 * @param {Object} job - Objeto da vaga
 * @returns {string} Mensagem formatada
 */
function formatJobMessage(job) {
  const title = job.title || job.job_title || "Não informado"

  const fields = job.fields || []
  const normalize = (value) => {
    if (!value) {
      return ""
    }
    return value
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
  }

  const getFieldValue = (keys) => {
    for (const field of fields) {
      const fieldName = normalize(field?.name)
      if (!fieldName) {
        continue
      }
      for (const key of keys) {
        if (fieldName.includes(key)) {
          return field?.value || null
        }
      }
    }
    return null
  }

  const company = getFieldValue(["empresa", "company"]) || job.author?.name || job.company || "Não informado"
  const location = getFieldValue(["localidade", "localizacao", "local"]) || job.location || "Não informado"
  const salary = getFieldValue(["salario", "remuneracao"]) || job.salary || "Não informado"
  const regime = getFieldValue(["regime", "contratacao"]) || job.hiring_regime || "Não informado"
  const workType = getFieldValue(["modalidade", "tipo"]) || job.work_type || "Não informado"
  const publicationDate = getFieldValue(["data de publicacao", "publicacao"]) || job.publication_date || "Não informado"
  const jobUrl = job.url || job.job_url || ""
  let message = `${BOT_EMOJI} *VAGA PERSONALIZADA PARA VOC?!*\n\n`

  message += `📌 *Título:* ${title}\n`
  message += `🏢 *Empresa:* ${company}\n`
  message += `📍 *Local:* ${location}\n`
  message += `💰 *Salário:* ${salary}\n`
  message += `📝 *Regime:* ${regime}\n`
  message += `🏠 *Tipo:* ${workType}\n`
  message += `📅 *Publicação:* ${publicationDate}\n`

  if (jobUrl) {
    message += `\n🔗 *Link para candidatura:*\n${jobUrl}`
  }

  message += `\n\n_Enviado pelo Sonar Bot VIP_ ⭐`

  return message
}

/**
 * Converte LID para JID do WhatsApp
 * @param {string} lid - ID no formato @lid
 * @returns {string} JID no formato @s.whatsapp.net
 */
function lidToJid(lid) {
  // Se já está no formato correto
  if (lid.includes("@lid") || lid.includes("@s.whatsapp.net")) {
    return lid
  }

  // Remove @lid e adiciona @s.whatsapp.net
  const number = lid.replace("@lid", "").replace("@s.whatsapp.net", "")
  return `${number}@s.whatsapp.net`
}

/**
 * Solicita ao serviço de cards um card para a vaga
 * @param {Object} job
 * @param {string} to
 * @returns {Object|null}
 */
async function fetchJobCard(job, to) {
  try {
    const response = await axios.post(
      `${CARD_API_URL}/cards/generate`,
      { embed: job, to },
      { timeout: 30000 }
    )
    return response.data || null
  } catch (err) {
    errorLog(`[VIP CARD] Erro ao gerar card: ${err.message}`)
    return null
  }
}

/**
 * Envia o card gerado para o assinante
 * @param {string} jid
 * @param {Object} cardData
 * @param {Object} socket
 * @returns {boolean}
 */
async function sendCardPayload(jid, jobId, cardData, socket) {
  if (!cardData?.image?.base64) {
    return false
  }

  try {
    const buffer = Buffer.from(cardData.image.base64, "base64")
    await delay(TIMEOUT_IN_MILLISECONDS_BY_EVENT)
    await socket.sendMessage(jid, {
      image: buffer,
      caption: cardData.text,
      mimetype: cardData.image.mimeType
    })
    const timestamp = new Date().toISOString()
    successLog(`[VIP CARD] Job ${jobId} sent to ${jid} at ${timestamp}`)
    return true
  } catch (err) {
    errorLog(`[VIP CARD] Falha ao enviar card para ${jid}: ${err.message}`)
    return false
  }
}

/**
 * Envia uma vaga para um assinante VIP
 * IMPORTANTE: Verifica intervalo de 7 minutos e histórico de 48h via persistência
 * @param {string} lid - LID do assinante
 * @param {Object} job - Vaga a enviar
 * @returns {{success: boolean, reason?: string}}
 */
async function sendJobToSubscriber(lid, job) {
  try {
    // Valida LID
    if (!lid || lid.trim() === "") {
      warningLog("[VIP] Tentativa de envio para LID vazio")
      return { success: false, reason: "invalid_lid" }
    }

    const socket = getCurrentSocket()
    if (!isCurrentSocketReady()) {
      warningLog("Conexao fechada. Envio VIP aguardando reconexao.")
      return { success: false, reason: "connection_closed" }
    }

    // Verifica intervalo de 7 minutos (persistido)
    if (!(await canSendToSubscriber(lid))) {
      const remaining = await getTimeUntilCanSend(lid)
      const remainingMin = Math.ceil(remaining / 60000)
      warningLog(`[VIP] Cooldown ativo para ${lid}. Aguardar ${remainingMin} minutos.`)
      return { success: false, reason: "cooldown" }
    }

    const jobId = job.id || job.url || job.job_url

    // Verifica se a vaga já foi enviada nas últimas 48h (persistido)
    if (await wasJobSentRecently(lid, jobId)) {
      return { success: false, reason: "already_sent" }
    }

    const jid = lidToJid(lid)
    const cardPayload = await fetchJobCard(job, jid)
    if (!cardPayload) {
      const reason = "card_generation_failed"
      warningLog(`[VIP] Card não gerado para ${lid}: ${reason}`)
      return { success: false, reason }
    }

    const sent = await sendCardPayload(jid, jobId, cardPayload, socket)
    if (!sent) {
      const reason = "card_send_failed"
      warningLog(`[VIP] Falha ao enviar card para ${lid}: ${reason}`)
      return { success: false, reason }
    }

    // Registra o envio (persiste em arquivo)
    await recordJobSent(lid, jobId)

    return { success: true }
  } catch (err) {
    errorLog(`[VIP] Erro ao enviar vaga para ${lid}: ${err.message}`)
    return { success: false, reason: "error" }
  }
}

/**
 * Processa novas vagas e envia para assinantes VIP
 */
async function processVipJobs() {
  if (!isCurrentSocketReady()) {
    warningLog("Conexao fechada. Verificacao VIP aguardando reconexao.")
    return
  }

  await processPendingVipSearches()

  // Limpa entradas antigas periodicamente
  await cleanOldEntries()

  const jobs = await loadJobs()
  const subscribers = await getVipSubscribers()

  if (jobs.length === 0 || subscribers.length === 0) {
    return
  }

  infoLog(`[VIP] Verificando ${jobs.length} vagas para ${subscribers.length} assinantes`)

  for (const subscriber of subscribers) {
    // Pula assinantes sem LID válido
    if (!subscriber.lid || subscriber.lid.trim() === "") {
      warningLog(`[VIP] Assinante ${subscriber.name || "desconhecido"} sem LID válido, pulando...`)
      continue
    }

    // Verifica cooldown de 7 minutos (persistido)
    if (!(await canSendToSubscriber(subscriber.lid))) {
      continue
    }

    // Obtém IDs de vagas já enviadas nas últimas 48h
    const sentJobIds = await getSentJobIds(subscriber.lid)

    // Usa filtros completos se disponível, senão usa stacks (compatibilidade legada)
    const filters = subscriber.filters || { stacks: subscriber.stacks || [] }

    for (const job of jobs) {
      const jobId = job.id || job.url || job.job_url

      // Pula vagas já enviadas nas últimas 48h
      if (sentJobIds.has(jobId)) {
        continue
      }

      // Verifica se a vaga corresponde aos filtros
      if (!jobMatchesFilters(job, filters)) {
        continue
      }

      const result = await sendJobToSubscriber(subscriber.lid, job)

      if (result.success) {
        successLog(`[VIP] Vaga enviada para ${subscriber.lid}: ${job.title || job.job_title}`)
      }

      // Independente do resultado, só tenta enviar uma vaga por ciclo
      break
    }

    await delay(1000)
  }
}

/**
 * Inicia o serviço de envio de vagas VIP
 * @param {Object} socket - Socket do Baileys (usado apenas para registrar evento)
 */
export async function startVipJobSender(socket) {
  if (vipTimeoutId) {
    clearTimeout(vipTimeoutId)
    vipTimeoutId = null
  }
  if (vipIntervalId) {
    clearInterval(vipIntervalId)
    vipIntervalId = null
  }
  if (vipPendingTimeoutId) {
    clearTimeout(vipPendingTimeoutId)
    vipPendingTimeoutId = null
  }
  vipRunToken += 1
  const subscribers = await getVipSubscribers()

  // Limpa entradas antigas do histórico ao iniciar
  await cleanOldEntries()

  infoLog("════════════════════════════════════════════════════")
  infoLog("       ⭐ SERVIÇO DE VAGAS VIP INICIADO")
  infoLog("════════════════════════════════════════════════════")
  infoLogAlways(`👥 Assinantes ativos: ${subscribers.length}`)
  infoLog(`⏱️  Intervalo de verificação: ${CHECK_INTERVAL / 60000} minutos`)
  infoLog(`⏱️  Cooldown por assinante: 7 minutos`)
  infoLog(`⏱️  Cooldown para reenvio: 48 horas`)
  infoLog("════════════════════════════════════════════════════")

  if (subscribers.length > 0) {
    subscribers.forEach((s) => {
      const filters = s.filters || { stacks: s.stacks || [] }
      const filterSummary = []
      if (filters.stacks?.length) filterSummary.push(`stacks: ${filters.stacks.join(",")}`)
      if (filters.roles?.length) filterSummary.push(`roles: ${filters.roles.join(",")}`)
      if (filters.seniority?.length) filterSummary.push(`seniority: ${filters.seniority.join(",")}`)
      if (filters.workMode?.length) filterSummary.push(`workMode: ${filters.workMode.join(",")}`)
      const lidStatus = s.lid && s.lid.trim() !== "" ? s.lid : "SEM LID!"
      infoLog(`   └─ ${s.name || "Sem nome"} (${lidStatus}): ${filterSummary.join(" | ") || "sem filtros"}`)
    })
  }

  // Processa buscas pendentes assim que possivel
  const token = vipRunToken
  vipPendingTimeoutId = setTimeout(async () => {
    if (token != vipRunToken) {
      return
    }
    if (!isCurrentSocketReady()) {
      return
    }
    await processPendingVipSearches()
  }, 5000)

  // Primeira execução IMEDIATA (após 5 segundos para garantir conexão estável)
  infoLog(`⏱️ Primeira verificação VIP em 5 segundos (envio imediato)`)
  vipTimeoutId = setTimeout(async () => {
    if (token != vipRunToken) {
      return
    }
    infoLog(`[VIP] Executando primeira verificação de vagas (envio imediato)...`)
    await processVipJobs()
  }, 5 * 1000)

  // Execuções periódicas
  vipIntervalId = setInterval(async () => {
    if (token != vipRunToken) {
      return
    }
    infoLog(`[VIP] Executando verificação periódica de vagas...`)
    await processVipJobs()
  }, CHECK_INTERVAL)
}

/**
 * Força o envio imediato para um assinante (útil para testes)
 * @param {string} lid - LID do assinante
 */
export async function forceVipJobCheck(lid) {
  const jobs = await loadJobs()
  const subscriber = (await getVipSubscribers()).find((s) => s.lid === lid)

  if (!subscriber) {
    return { success: false, message: "Assinante não encontrado" }
  }

  // Verifica cooldown
  if (!(await canSendToSubscriber(lid))) {
    const remaining = await getTimeUntilCanSend(lid)
    const remainingMin = Math.ceil(remaining / 60000)
    return { success: false, message: `Aguarde ${remainingMin} minutos para o próximo envio` }
  }

  // Obtém vagas já enviadas
  const sentJobIds = await getSentJobIds(lid)

  // Usa filtros completos se disponível
  const filters = subscriber.filters || { stacks: subscriber.stacks || [] }

  for (const job of jobs.slice(-50)) {
    const jobId = job.id || job.url || job.job_url

    // Pula vagas já enviadas nas últimas 48h
    if (sentJobIds.has(jobId)) {
      continue
    }

    if (!jobMatchesFilters(job, filters)) {
      continue
    }

    const result = await sendJobToSubscriber(lid, job)
    if (result.success) {
      return { success: true, message: "1 vaga enviada" }
    }

    if (result.reason === "cooldown") {
      const remaining = await getTimeUntilCanSend(lid)
      const remainingMin = Math.ceil(remaining / 60000)
      return { success: false, message: `Aguarde ${remainingMin} minutos para o próximo envio` }
    }

    return { success: false, message: `Erro: ${result.reason}` }
  }

  return { success: true, message: "Nenhuma vaga nova encontrada" }
}

/**
 * Dispara busca VIP dedicada para um cliente
 * Busca vagas no embeds.json que correspondem aos filtros do assinante
 * @param {string} lid - LID do assinante
 * @param {string[]|Object} stacksOrFilters - Stacks/keywords para buscar ou objeto de filtros
 * @param {Object} options - Opções adicionais
 * @returns {Promise<{success: boolean, jobsFound: number, jobsSent: number, error?: string}>}
 */
export async function triggerVipSearch(lid, stacksOrFilters, options = {}) {
  // Normaliza para objeto de filtros
  const filters = (stacksOrFilters && typeof stacksOrFilters === 'object' && !Array.isArray(stacksOrFilters))
    ? stacksOrFilters
    : { stacks: stacksOrFilters || [] }

  try {
    if (!isCurrentSocketReady()) {
      warningLog("Conexao fechada. Busca VIP aguardando reconexao.")
      if (options.allowQueue !== false) {
        queueVipSearch(lid, filters)
        infoLog(`[VIP] Busca enfileirada para ${lid} (conexao fechada).`)
        return {
          success: true,
          queued: true,
          jobsFound: 0,
          jobsSent: 0,
          error: "Conexao fechada. Busca enfileirada.",
        }
      }
      return {
        success: false,
        jobsFound: 0,
        jobsSent: 0,
        error: "Conexao fechada",
      }
    }

    const filterSummary = []
    if (filters.stacks?.length) filterSummary.push(`stacks: ${filters.stacks.join(",")}`)
    if (filters.roles?.length) filterSummary.push(`roles: ${filters.roles.join(",")}`)
    if (filters.seniority?.length) filterSummary.push(`seniority: ${filters.seniority.join(",")}`)
    infoLog(`[VIP SEARCH] Disparando busca para ${lid} com ${filterSummary.join(" | ") || "filtros vazios"}`)

    // Verifica cooldown de 7 minutos
    if (!(await canSendToSubscriber(lid))) {
      const remaining = await getTimeUntilCanSend(lid)
      const remainingMin = Math.ceil(remaining / 60000)
      warningLog(`[VIP SEARCH] Cooldown ativo para ${lid}. Aguardar ${remainingMin} minutos.`)
      return {
        success: true,
        jobsFound: 0,
        jobsSent: 0,
        error: `Aguarde ${remainingMin} minutos para o próximo envio`,
      }
    }

    // Carrega todas as vagas do Supabase
    const jobs = await loadJobs()

    if (jobs.length === 0) {
      warningLog("[VIP SEARCH] Nenhuma vaga disponível no Supabase")
      return {
        success: false,
        jobsFound: 0,
        jobsSent: 0,
        error: "Nenhuma vaga disponível no momento",
      }
    }

    // Obtém IDs de vagas já enviadas nas últimas 48h
    const sentJobIds = await getSentJobIds(lid)

    // Filtra vagas que correspondem aos filtros e não foram enviadas recentemente
    const matchingJobs = []
    for (const job of jobs) {
      const jobId = job.id || job.url || job.job_url

      // Pula vagas já enviadas nas últimas 48h
      if (sentJobIds.has(jobId)) {
        continue
      }

      // Verifica se a vaga corresponde aos filtros
      if (jobMatchesFilters(job, filters)) {
        matchingJobs.push(job)
      }
    }

    infoLog(`[VIP SEARCH] Encontradas ${matchingJobs.length} vagas novas para ${lid}`)

    if (matchingJobs.length === 0) {
      return {
        success: true,
        jobsFound: 0,
        jobsSent: 0,
        error: "Nenhuma vaga nova encontrada para os filtros informados",
      }
    }

    // Envia apenas uma vaga (regra: 1 vaga a cada 7 minutos)
    let jobsSent = 0
    const job = matchingJobs[0]

    const result = await sendJobToSubscriber(lid, job)
    if (result.success) {
      jobsSent = 1
      successLog(`[VIP SEARCH] Vaga enviada para ${lid}: ${job.title || job.job_title}`)
    } else {
      warningLog(`[VIP SEARCH] Não foi possível enviar: ${result.reason}`)
    }

    successLog(`[VIP SEARCH] Busca concluída para ${lid}: ${jobsSent}/${matchingJobs.length} vagas enviadas`)

    return {
      success: true,
      jobsFound: matchingJobs.length,
      jobsSent,
    }
  } catch (err) {
    errorLog(`[VIP SEARCH] Erro na busca VIP: ${err.message}`)

    return {
      success: false,
      jobsFound: 0,
      jobsSent: 0,
      error: err.message,
    }
  }
}
