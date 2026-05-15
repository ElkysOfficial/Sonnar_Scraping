// Lista curada de stacks. Usada no cadastro e no perfil de busca.
// Agrupada por categoria pra facilitar selecao visual.

export interface StackGroup {
  category: string
  items: string[]
}

export const STACK_GROUPS: StackGroup[] = [
  {
    category: 'Linguagens',
    items: [
      'JavaScript', 'TypeScript', 'Python', 'Java', 'C#', 'Go', 'Ruby', 'PHP',
      'Kotlin', 'Swift', 'Rust', 'C++', 'Scala', 'Dart', 'Elixir'
    ]
  },
  {
    category: 'Frontend',
    items: ['React', 'Vue', 'Angular', 'Svelte', 'Next.js', 'Nuxt', 'Remix', 'Astro']
  },
  {
    category: 'Backend',
    items: [
      'Node.js', 'Express', 'NestJS', 'Django', 'Flask', 'FastAPI',
      'Spring', 'Spring Boot', 'Rails', 'Laravel', '.NET', 'ASP.NET'
    ]
  },
  {
    category: 'Mobile',
    items: ['React Native', 'Flutter', 'iOS Native', 'Android Native']
  },
  {
    category: 'Banco de dados',
    items: ['PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'DynamoDB', 'Oracle', 'SQL Server', 'BigQuery', 'Snowflake']
  },
  {
    category: 'Cloud & DevOps',
    items: ['AWS', 'GCP', 'Azure', 'Kubernetes', 'Docker', 'Terraform', 'Ansible', 'Jenkins', 'GitHub Actions']
  },
  {
    category: 'Data & ML',
    items: ['SQL', 'Spark', 'Airflow', 'dbt', 'Pandas', 'TensorFlow', 'PyTorch']
  },
  {
    category: 'Outros',
    items: ['GraphQL', 'REST', 'gRPC', 'Kafka', 'RabbitMQ', 'Elasticsearch']
  }
]

// Versao flat - util pra autocompletar / validar.
export const STACK_FLAT: string[] = STACK_GROUPS.flatMap(g => g.items)
