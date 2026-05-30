"""
Vocabulario canonico de skills para EXTRACAO a partir de descricoes de vaga.

Esta lista e independente de ``variavel.stacks`` (que controla os termos de
BUSCA nas engines). Motivo da separacao:

- ``variavel.stacks`` muda por motivos operacionais (testes rapidos,
  batching, throttling). Pode ficar pequena.
- ``SKILLS_VOCABULARY`` so muda quando queremos passar a reconhecer uma
  nova tecnologia no texto livre. Deve ser sempre ampla.

Acoplar os dois implicava que reduzir a busca matava a extracao - cada
vaga voltava com ``skills=[]`` se nao mencionasse a unica stack ativa.

Diretrizes para edicao
----------------------
1. **Variantes ortograficas valem a pena**: ``"Node.js"``, ``"NodeJS"``,
   ``"Microsservicos"``, ``"Microservicos"``, ``"Microservices"``.
   ``re.IGNORECASE`` ja cobre case, mas nao cobre acento/grafia. O
   matcher e ordenado por 1a ocorrencia, dedup por nome canonico nao e
   responsabilidade dele.
2. **Tokens com 1 caractere sao excluidos** (filtro em ``text_utils``)
   para nao casar ``R``, ``C``, ``D`` em texto natural. Use a forma
   completa: ``"R Programming"`` ou ``"Linguagem R"``.
3. **Evite tokens curtos genericos** (``"Make"``, ``"Lit"``, ``"Gin"``,
   ``"Echo"``, ``"Fiber"``, ``"Flow"``, ``"Ray"``). Mesmo com lookaround,
   geram falso positivo em prosa comum.
4. **Compostos sao OK**: ``"Apache Spark"``, ``"AWS Lambda"``,
   ``"Azure DevOps"``. O lookaround so verifica os limites externos do
   token, espacos internos sao literais.
"""
from __future__ import annotations

from typing import Dict, List, Set


SKILLS_BY_CATEGORY: Dict[str, List[str]] = {
    # ---------------------------------------------------------------
    # Linguagens
    # ---------------------------------------------------------------
    "Linguagens": [
        "Python", "Java", "JavaScript", "TypeScript",
        "C#", "C++", "Objective-C", "Go", "Golang", "Rust",
        "Ruby", "PHP", "Swift", "Kotlin", "Scala", "MATLAB",
        "Perl", "Haskell", "Elixir", "Erlang", "Clojure", "Lua",
        "Dart", "VB.NET", "Visual Basic", "F#", "Groovy",
        "COBOL", "Fortran", "Assembly", "Pascal", "Delphi",
        "Solidity", "Julia", "ABAP", "PL/SQL", "T-SQL",
        "Bash", "Shell Script", "PowerShell", "Crystal", "Nim",
        "Zig", "OCaml",
    ],
    # ---------------------------------------------------------------
    # Front-end
    # ---------------------------------------------------------------
    "Front-End": [
        "React", "React.js", "ReactJS",
        "Angular", "AngularJS",
        "Vue", "Vue.js", "VueJS", "Vuex", "Pinia",
        "Next.js", "NextJS",
        "Nuxt", "Nuxt.js",
        "Svelte", "SvelteKit",
        "Remix", "Astro", "Gatsby", "Qwik",
        "Solid.js", "SolidJS",
        "Ember", "Ember.js", "Backbone", "Backbone.js",
        "Alpine.js", "Stimulus",
        "jQuery",
        "HTML", "HTML5", "CSS", "CSS3",
        "SASS", "SCSS", "LESS", "Stylus", "PostCSS",
        "Bootstrap", "Tailwind", "Tailwind CSS",
        "Material UI", "MUI", "Chakra UI", "Ant Design",
        "Styled Components", "Emotion",
        "Redux", "Redux Toolkit", "MobX", "Zustand", "Recoil", "Pinia",
        "RxJS", "TanStack Query", "React Query", "SWR",
        "Storybook", "Vitest", "Cypress",
        "Webpack", "Vite", "Rollup", "Babel", "ESBuild", "Parcel", "Turbopack",
        "PWA", "Web Components", "WebGL", "WebAssembly", "WASM",
        "Three.js", "D3", "D3.js", "Chart.js", "Highcharts",
        "Babylon.js", "PixiJS",
    ],
    # ---------------------------------------------------------------
    # Back-end
    # ---------------------------------------------------------------
    "Back-End": [
        "Node.js", "NodeJS",
        "Express", "Express.js",
        "Django", "Flask", "FastAPI", "Tornado", "Sanic", "Aiohttp", "Bottle",
        "Spring", "Spring Boot", "Spring Cloud", "Spring Security",
        "Quarkus", "Micronaut", "Vert.x",
        "Hibernate", "JPA", "JDBC",
        ".NET", ".NET Core", ".NET 5", ".NET 6", ".NET 7", ".NET 8",
        "ASP.NET", "ASP.NET Core", ".NET MAUI", "MAUI",
        "Entity Framework", "Dapper", "SQLAlchemy",
        "Laravel", "Symfony", "CodeIgniter", "Slim", "Lumen", "Yii",
        "Ruby on Rails", "Rails", "Sinatra", "Hanami",
        "NestJS", "Nest.js", "AdonisJS", "Hapi", "Koa", "Fastify",
        "Strapi", "Sails", "LoopBack",
        "Gin Gonic", "Fiber Go", "Go Fiber", "Echo Framework",
        "Phoenix", "Play Framework", "Actix", "Rocket",
        "Vapor", "Drogon",
    ],
    # ---------------------------------------------------------------
    # Mobile
    # ---------------------------------------------------------------
    "Mobile": [
        "React Native", "Flutter",
        "Xamarin", "Ionic", "Capacitor", "Cordova", "NativeScript",
        "SwiftUI", "Jetpack Compose", "Kotlin Multiplatform", "KMM",
        "Combine", "RxSwift", "CoreData",
        "Android", "Android SDK", "Android Studio",
        "iOS", "iOS SDK", "Xcode",
        "Objective-C", "UIKit", "Realm", "ObjectBox",
        "Expo", "Firebase",
    ],
    # ---------------------------------------------------------------
    # Blockchain / Web3
    # ---------------------------------------------------------------
    "Blockchain": [
        "Ethereum", "Bitcoin", "Polygon", "Solana", "BSC",
        "Hardhat", "Truffle", "Foundry",
        "Web3.js", "Ethers.js", "Viem", "Wagmi",
        "Smart Contracts", "DApp", "NFT", "DeFi",
        "OpenZeppelin", "IPFS",
    ],
    # ---------------------------------------------------------------
    # Banco de Dados
    # ---------------------------------------------------------------
    "Banco de Dados": [
        "SQL", "NoSQL", "NewSQL",
        "PostgreSQL", "Postgres", "MySQL", "MariaDB",
        "MongoDB", "Redis", "Memcached",
        "Oracle", "Oracle Database",
        "SQL Server", "Microsoft SQL Server", "MSSQL",
        "SQLite", "DB2", "IBM DB2", "Sybase", "Informix",
        "Cassandra", "ScyllaDB", "HBase", "Riak",
        "DynamoDB", "Cosmos DB", "Firestore", "FaunaDB",
        "Elasticsearch", "OpenSearch", "Solr",
        "Neo4j", "ArangoDB", "OrientDB", "JanusGraph",
        "CouchDB", "Couchbase", "RethinkDB",
        "Supabase", "PlanetScale", "Vitess",
        "ClickHouse", "InfluxDB", "TimescaleDB", "QuestDB",
        "RocksDB", "LevelDB", "etcd",
    ],
    # ---------------------------------------------------------------
    # Cloud (provedores e servicos por provedor)
    # ---------------------------------------------------------------
    "Cloud": [
        "AWS", "Amazon Web Services",
        "EC2", "S3", "RDS", "ECS", "EKS", "SQS", "SNS", "IAM", "Lambda",
        "Azure", "Microsoft Azure",
        "GCP", "Google Cloud", "Google Cloud Platform",
        "Oracle Cloud", "OCI", "IBM Cloud", "Alibaba Cloud",
        "DigitalOcean", "Linode", "Cloudflare", "Vercel", "Netlify",
        "Heroku", "Firebase", "Render", "Fly.io",
        "AWS Lambda", "AWS S3", "AWS EC2", "AWS RDS", "AWS ECS", "AWS EKS",
        "AWS Fargate", "AWS CloudFront", "AWS Route 53", "AWS IAM",
        "AWS CloudWatch", "AWS CloudFormation", "AWS SQS", "AWS SNS",
        "AWS Kinesis", "AWS EventBridge", "AWS Step Functions",
        "AWS Glue", "AWS Athena", "AWS EMR", "AWS Redshift",
        "AWS Aurora", "AWS DMS", "AWS Bedrock", "AWS SageMaker",
        "AWS AppSync", "AWS Secrets Manager", "AWS KMS",
        "Azure Functions", "Azure DevOps", "Azure Pipelines", "Azure Repos",
        "Azure Boards", "Azure Service Bus", "Azure Event Hub",
        "Azure Data Factory", "Azure Synapse", "Azure ML", "Azure OpenAI",
        "Azure AD", "Entra ID", "Azure Active Directory",
        "Cloud Functions", "Cloud Run", "BigQuery", "Pub/Sub",
        "Vertex AI", "Dataflow", "Dataproc", "Looker Studio",
    ],
    # ---------------------------------------------------------------
    # DevOps / SRE / Infra-as-Code
    # ---------------------------------------------------------------
    "DevOps & SRE": [
        "Docker", "Podman", "Containerd", "Buildah",
        "Kubernetes", "K8s", "Helm", "Kustomize",
        "ArgoCD", "Flux", "GitOps", "Rancher", "OpenShift",
        "Nomad", "Consul", "Vault", "HashiCorp", "HashiCorp Vault",
        "Terraform", "Pulumi", "Crossplane", "CloudFormation", "CDK",
        "Ansible", "Chef", "Puppet", "SaltStack",
        "Jenkins", "GitHub Actions", "GitLab CI", "GitLab CI/CD",
        "CircleCI", "Travis CI", "Bamboo", "TeamCity", "Buildkite",
        "Drone CI", "Tekton", "Spinnaker", "Concourse", "Octopus Deploy",
        "CI/CD", "DevOps", "DevSecOps", "SRE", "Site Reliability Engineering",
        "Linux", "Unix", "Ubuntu", "Debian", "CentOS", "RedHat", "RHEL",
        "Nginx", "Apache", "HAProxy", "Traefik", "Envoy", "Istio",
        "Linkerd", "Service Mesh",
        "Prometheus", "Grafana", "Loki", "Grafana Tempo", "Mimir",
        "Datadog", "New Relic", "Splunk", "AppDynamics", "Dynatrace",
        "Sentry", "Rollbar", "Bugsnag", "Honeycomb",
        "ELK", "ELK Stack", "Logstash", "Kibana", "Beats",
        "Jaeger", "Zipkin", "OpenTelemetry", "OTel",
        "Bazel", "Maven", "Gradle", "npm", "Yarn", "pnpm",
        "NuGet", "pip", "Conda", "Poetry", "Pipenv",
    ],
    # ---------------------------------------------------------------
    # Data Engineering / Analytics
    # ---------------------------------------------------------------
    "Data Engineering": [
        "ETL", "ELT", "Data Pipeline",
        "Apache Spark", "Spark", "PySpark",
        "Apache Kafka", "Kafka", "Kafka Streams", "Kafka Connect",
        "Apache Pulsar", "Pulsar",
        "RabbitMQ", "ActiveMQ", "NATS", "ZeroMQ", "MQTT",
        "Apache Airflow", "Airflow", "Luigi", "Prefect", "Dagster",
        "dbt", "dbt Core",
        "Snowflake", "Databricks", "BigQuery", "Redshift",
        "Hadoop", "HDFS", "Hive", "Apache Hive", "Presto", "Trino",
        "Apache Beam", "Beam", "Apache Flink", "Flink",
        "Apache Storm", "NiFi", "Apache NiFi",
        "Apache Druid", "Druid", "Apache Pinot", "Pinot",
        "Apache Iceberg", "Iceberg", "Delta Lake", "Apache Hudi", "Hudi",
        "Fivetran", "Stitch", "Matillion", "Talend", "Pentaho",
        "Informatica", "SSIS", "SSAS", "SSRS",
        "Data Warehouse", "Data Lake", "Lakehouse",
        "OLAP", "OLTP", "Star Schema", "Data Vault",
        "Pandas", "NumPy", "Polars", "Dask", "Modin",
    ],
    # ---------------------------------------------------------------
    # Business Intelligence
    # ---------------------------------------------------------------
    "BI": [
        "Power BI", "Tableau", "Looker", "Looker Studio",
        "Metabase", "Qlik", "QlikView", "QlikSense",
        "Superset", "Apache Superset", "Redash",
        "Google Data Studio", "Domo", "Sisense", "MicroStrategy",
        "Excel", "Advanced Excel", "VBA", "Macros",
    ],
    # ---------------------------------------------------------------
    # ML / AI
    # ---------------------------------------------------------------
    "ML & AI": [
        "Machine Learning", "ML",
        "Deep Learning", "Data Science",
        "TensorFlow", "PyTorch", "Keras", "JAX",
        "Scikit-learn", "scikit-learn", "XGBoost", "LightGBM", "CatBoost",
        "MXNet", "FastAI", "fastai",
        "ONNX", "TFLite", "TensorRT", "Triton Inference Server",
        "OpenCV", "MediaPipe", "Tesseract",
        "NLP", "Computer Vision", "CV",
        "NLU", "ASR", "TTS",
        "MLOps", "MLflow", "Kubeflow", "Weights & Biases", "W&B",
        "Vertex AI", "SageMaker", "Azure ML", "Bedrock",
        "Optuna", "Ray", "Ray Tune",
        "LLM", "LLMs", "GPT", "GPT-4", "GPT-5",
        "ChatGPT", "OpenAI", "Azure OpenAI", "Anthropic", "Claude",
        "Gemini", "LLaMA", "Llama", "Mistral", "Whisper",
        "Hugging Face", "HuggingFace", "Transformers",
        "BERT", "T5", "Diffusion Models", "Stable Diffusion",
        "LangChain", "LangGraph", "LlamaIndex", "Semantic Kernel",
        "CrewAI", "AutoGen", "Haystack",
        "RAG", "Embeddings", "Vector Database", "Vector Search",
        "Pinecone", "Weaviate", "Chroma", "Qdrant", "Milvus", "FAISS",
        "Fine-tuning", "Prompt Engineering", "LoRA", "QLoRA",
        "Reinforcement Learning", "RLHF", "GAN", "GANs",
        "CNN", "RNN", "LSTM", "Attention",
        "Recommender Systems", "Time Series", "Anomaly Detection",
        "A/B Testing", "AutoML",
        "Jupyter", "JupyterLab", "Google Colab", "Colab",
        "MCP",
    ],
    # ---------------------------------------------------------------
    # Arquitetura
    # ---------------------------------------------------------------
    "Arquitetura": [
        "Microservices", "Microsservicos", "Microservicos", "Microsserviços",
        "Monolito", "Monolithic",
        "Backend", "Back-End", "Frontend", "Front-End", "Fullstack", "Full-Stack",
        "Serverless", "FaaS",
        "API", "APIs", "REST", "REST API", "RESTful",
        "GraphQL", "Apollo", "Apollo Server",
        "gRPC", "Protobuf", "Protocol Buffers",
        "SOAP", "WSDL", "WebSocket", "WebSockets", "SSE",
        "API Gateway", "BFF", "Backend for Frontend",
        "Service Mesh",
        "Software Architecture", "System Design",
        "Domain Driven Design", "Domain-Driven Design", "DDD",
        "Hexagonal Architecture", "Arquitetura Hexagonal",
        "Clean Architecture", "Onion Architecture",
        "SOLID", "Design Patterns",
        "Event Driven", "Event-Driven", "EDA",
        "CQRS", "Event Sourcing", "Saga Pattern", "Outbox Pattern",
        "Cloud Native",
        "TDD", "BDD", "ATDD",
        "OpenAPI", "Swagger", "AsyncAPI", "Pact",
        "JSON Schema", "XML", "YAML", "Avro", "Thrift", "MessagePack",
        "12 Factor", "Twelve Factor",
    ],
    # ---------------------------------------------------------------
    # Seguranca
    # ---------------------------------------------------------------
    "Seguranca": [
        "Cybersecurity", "Cibersseguranca", "Seguranca da Informacao",
        "Information Security", "InfoSec", "AppSec", "DevSecOps",
        "Penetration Testing", "Pentest", "Pentesting",
        "Red Team", "Blue Team", "Purple Team",
        "SIEM", "SOC", "SOAR", "EDR", "XDR", "IDS", "IPS", "WAF", "DLP",
        "OAuth", "OAuth2", "OpenID Connect", "OIDC",
        "JWT", "SSO", "SAML", "Keycloak", "Auth0", "Okta",
        "MFA", "2FA", "RBAC", "ABAC", "Zero Trust",
        "OWASP", "OWASP Top 10", "OWASP ZAP",
        "Burp Suite", "Metasploit", "Nmap", "Wireshark", "Nessus",
        "Snyk", "SonarQube", "Veracode", "Checkmarx", "Trivy", "Falco",
        "CrowdStrike", "Carbon Black",
        "ISO 27001", "SOC 2", "PCI DSS", "HIPAA", "NIST",
        "LGPD", "GDPR",
        "TLS", "mTLS", "SSL", "PKI", "X.509", "GPG", "PGP",
        "KMS", "HSM",
    ],
    # ---------------------------------------------------------------
    # QA / Testing
    # ---------------------------------------------------------------
    "QA & Testing": [
        "Selenium", "Cypress", "Playwright", "Puppeteer",
        "WebdriverIO", "Nightwatch",
        "Jest", "Vitest", "Mocha", "Chai", "Sinon", "Jasmine",
        "Enzyme", "React Testing Library", "Testing Library",
        "JUnit", "TestNG", "AssertJ",
        "pytest", "unittest", "nose",
        "RSpec", "Capybara",
        "Cucumber", "Robot Framework", "SpecFlow",
        "Postman", "Insomnia", "REST Assured",
        "Karate", "Karate DSL",
        "Appium", "Detox", "Espresso", "XCTest",
        "Gatling", "JMeter", "k6", "Locust", "LoadRunner",
        "BrowserStack", "Sauce Labs",
        "TestRail", "Zephyr", "Xray",
        "Allure", "Test Automation",
    ],
    # ---------------------------------------------------------------
    # ERP & sistemas corporativos
    # ---------------------------------------------------------------
    "ERP & Corporativo": [
        "SAP", "ABAP", "SAP ABAP",
        "SAP FI", "SAP CO", "SAP MM", "SAP SD", "SAP HR", "SAP HCM",
        "SAP PS", "SAP PP", "SAP PM", "SAP WM", "SAP EWM", "SAP TM",
        "SAP QM", "SAP IBP", "SAP CPI", "SAP MDG",
        "SAP BW", "SAP BI",
        "SAP CRM", "SAP SCM",
        "SAP Basis", "SAP Fiori", "SAP UI5", "SAP HANA",
        "SAP S/4HANA", "S/4HANA", "SAP ECC",
        "SAP SuccessFactors", "SAP Ariba", "SAP Concur",
        "SAP Solution Manager", "SAP BTP",
        "Oracle EBS", "Oracle Fusion", "PeopleSoft", "JD Edwards", "JDE",
        "Salesforce", "Apex", "Lightning", "SOQL", "SOSL",
        "ServiceNow", "Dynamics 365", "Microsoft Dynamics",
        "Workday", "NetSuite", "Infor", "Epicor", "Sage",
        "Protheus", "TOTVS", "Senior Sistemas", "Sankhya", "RM TOTVS",
        "Magento", "Shopify", "WooCommerce", "VTEX", "BigCommerce",
        "WordPress", "Drupal", "Joomla",
    ],
    # ---------------------------------------------------------------
    # Versionamento / Colaboracao / Agile
    # ---------------------------------------------------------------
    "Colaboracao & Agile": [
        "Git", "GitHub", "GitLab", "Bitbucket", "Azure Repos",
        "SVN", "Subversion", "Mercurial", "Perforce",
        "Jira", "Confluence", "Trello", "Asana", "Notion",
        "Linear", "ClickUp", "Monday.com",
        "Slack", "Microsoft Teams", "Discord", "Zoom",
        "Miro", "Mural", "Lucidchart", "Draw.io", "PlantUML", "Mermaid",
        "Figma", "Sketch", "Adobe XD", "InVision", "Zeplin",
        "Scrum", "Kanban", "Agile", "SAFe", "Scrumban", "Less", "Nexus",
        "XP", "Extreme Programming", "Lean",
        "Waterfall", "RUP",
        "OKRs", "KPIs",
        "ITIL", "COBIT", "PMBOK", "PRINCE2", "Six Sigma",
    ],
    # ---------------------------------------------------------------
    # Suporte / Infra / Redes
    # ---------------------------------------------------------------
    "Suporte & Redes": [
        "Active Directory", "Windows Server", "Group Policy", "GPO",
        "VMware", "vSphere", "vCenter", "ESXi",
        "Hyper-V", "Citrix", "Proxmox", "KVM", "Xen", "VirtualBox",
        "OpenStack",
        "Zabbix", "Nagios", "PRTG", "Cacti",
        "TCP/IP", "DNS", "DHCP", "VPN", "Firewall",
        "LAN", "WAN", "VLAN", "MPLS", "SD-WAN",
        "BGP", "OSPF", "EIGRP", "STP", "HSRP", "VRRP",
        "IPv4", "IPv6", "NAT", "QoS",
        "Cisco", "CCNA", "CCNP", "CCIE",
        "Juniper", "Aruba", "Mikrotik", "pfSense", "FortiGate",
        "Palo Alto", "Check Point", "Sophos", "F5", "BIG-IP",
        "Load Balancer",
        "iSCSI", "NFS", "SMB", "CIFS",
        "NetApp", "EMC", "IBM Storage",
        "Backup", "Veeam", "Commvault", "Bacula",
        "ZFS", "Btrfs", "RAID",
        "Disaster Recovery", "BCP", "DRP",
        "Help Desk", "Helpdesk", "Service Desk",
        "Suporte Tecnico", "Suporte de TI",
    ],
    # ---------------------------------------------------------------
    # Embedded / IoT / Industria
    # ---------------------------------------------------------------
    "Embedded & IoT": [
        "Arduino", "Raspberry Pi", "ESP32", "ESP8266", "STM32",
        "FreeRTOS", "Zephyr RTOS", "RTOS",
        "Modbus", "OPC UA", "CAN bus", "RS-232", "RS-485",
        "IoT", "Edge Computing", "Industria 4.0", "Industry 4.0",
        "PLC", "SCADA", "HMI", "DCS",
        "MQTT", "Mosquitto",
    ],
    # ---------------------------------------------------------------
    # RPA / Automacao / Low-code
    # ---------------------------------------------------------------
    "RPA & Automacao": [
        "RPA", "Robotic Process Automation",
        "UiPath", "Automation Anywhere", "Blue Prism",
        "BotCity", "Power Automate", "Workato",
        "n8n", "Zapier", "Make.com", "Integromat",
        "Apache Camel", "MuleSoft", "Boomi",
    ],
    # ---------------------------------------------------------------
    # Game dev / Graficos
    # ---------------------------------------------------------------
    "Game & Graphics": [
        "Unity", "Unreal Engine", "Unreal", "Godot",
        "GameMaker", "Cocos2d", "libGDX", "Phaser",
        "OpenGL", "DirectX", "Vulkan", "Metal", "WebGL",
        "Blender", "Maya", "3ds Max", "ZBrush",
    ],
    # ---------------------------------------------------------------
    # Cargos (PT)
    # ---------------------------------------------------------------
    "Cargos PT": [
        "Desenvolvedor", "Programador",
        "Desenvolvedor Full Stack", "Desenvolvedor Front-End",
        "Desenvolvedor Back-End", "Desenvolvedor Mobile",
        "Desenvolvedor Junior", "Desenvolvedor Pleno", "Desenvolvedor Senior",
        "Engenheiro de Software", "Arquiteto de Software",
        "Analista de Sistemas", "Analista Programador",
        "Analista de Dados", "Cientista de Dados", "Engenheiro de Dados",
        "Analista de QA", "Analista de Testes", "Engenheiro de Testes",
        "DBA", "Administrador de Banco de Dados",
        "Analista de Seguranca", "Analista DevOps",
        "Analista de Suporte", "Tecnico de TI", "Tecnico de Informatica",
        "Administrador de Redes", "Administrador de Sistemas",
        "Analista de Infraestrutura",
        "Tech Lead", "Tech Recruiter",
        "Estagiario TI", "Trainee",
        "Product Owner", "Product Manager", "Scrum Master",
    ],
    # ---------------------------------------------------------------
    # Cargos (EN)
    # ---------------------------------------------------------------
    "Cargos EN": [
        "Software Engineer", "Software Developer",
        "Full Stack Developer", "Fullstack Developer",
        "Frontend Developer", "Backend Developer",
        "Web Developer", "Mobile Developer",
        "DevOps Engineer", "Cloud Engineer", "Platform Engineer",
        "Site Reliability Engineer", "SRE",
        "Data Scientist", "Data Engineer", "Data Analyst",
        "ML Engineer", "Machine Learning Engineer",
        "AI Engineer", "MLOps Engineer",
        "QA Engineer", "QA Analyst", "SDET", "Test Engineer",
        "Security Engineer", "Security Analyst",
        "Solutions Architect", "Software Architect",
        "Technical Lead", "Engineering Manager",
        "Product Manager", "Scrum Master", "Agile Coach",
        "Network Engineer", "System Administrator", "Sysadmin",
        "Junior Developer", "Senior Developer",
        "Staff Engineer", "Principal Engineer",
        "CTO", "VP of Engineering", "Head of Engineering",
        "Game Developer", "Embedded Engineer",
    ],
    # ---------------------------------------------------------------
    # Idiomas e soft (curtos para evitar overlap, mantemos pouca coisa)
    # ---------------------------------------------------------------
    "Idiomas": [
        "Ingles Fluente", "Ingles Avancado", "Ingles Intermediario",
        "Espanhol Fluente", "Espanhol Avancado",
        "English Fluent", "Spanish Fluent",
    ],
}


# Set achatado - fonte de verdade consumida pelo matcher.
SKILLS_VOCABULARY: Set[str] = {
    s for items in SKILLS_BY_CATEGORY.values() for s in items
}
