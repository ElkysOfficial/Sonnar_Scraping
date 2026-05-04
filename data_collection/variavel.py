"""
Lista mestre de stacks (palavras-chave) usadas pelas engines de scraping.

A lista é organizada em **categorias** (linguagens, front-end, back-end, etc.).
O scraper processa as stacks em **lotes de 10** (batches), respeitando as
fronteiras de categoria — um lote nunca mistura stacks de categorias diferentes.

API pública
-----------
* ``STACK_CATEGORIES`` — dict ordenado ``categoria -> lista de stacks``.
* ``stacks``           — set com TODAS as stacks (derivado, para retrocompat).
* ``iter_batches(n)``  — gerador que yields ``(categoria, lote)`` de até ``n``
                         stacks por vez, em ordem.
* ``get_active_stacks()`` — devolve o lote atualmente ativo (ou todas, se None).
* ``set_active_batch(b)`` — chamado pelo controller a cada ciclo.

Por que existe lote?
--------------------
Mais de 200 stacks × N páginas/site = milhares de requests sequenciais por
ciclo. Sites detectam o padrão e começam a banir IP/sessão. Dividir em lotes
de 10, com 2h de descanso entre lotes, contorna esse problema mantendo a
cobertura completa ao longo do tempo.

Cada engine que itera stacks deve usar ``get_active_stacks()`` em vez de
``stacks``. Quando rodada isoladamente (sem controller), a função devolve o
set inteiro — comportamento padrão / retrocompatível.
"""
from __future__ import annotations

from typing import Iterable, Iterator, List, Optional, Set, Tuple


# ---------------------------------------------------------------------------
# Categorias (ordem preservada — Python 3.7+ garante ordem de inserção)
# ---------------------------------------------------------------------------

STACK_CATEGORIES: dict[str, List[str]] = {
    "Linguagens de Programação": [
        "Python", "Java", "JavaScript", "TypeScript", "C#", "C++", "Go", "Rust",
        "Ruby", "PHP", "Swift", "Kotlin", "Scala", "R", "MATLAB",
        "Perl", "Haskell", "Elixir", "Erlang", "Clojure", "Lua",
    ],
    "Front-End": [
        "React", "Angular", "Vue.js", "Next.js", "Svelte", "jQuery",
        "HTML", "CSS", "SASS", "Bootstrap", "Tailwind CSS", "Material UI",
    ],
    "Back-End Frameworks": [
        "Node.js", "Express.js", "Django", "Flask", "FastAPI",
        "Spring Boot", "Spring", ".NET", "ASP.NET", "Laravel", "Symfony",
        "Ruby on Rails", "NestJS", "Gin", "Echo",
    ],
    "Mobile": [
        "React Native", "Flutter", "iOS Developer", "Android Developer",
        "Xamarin", "Ionic", "SwiftUI", "Jetpack Compose",
    ],
    "Banco de Dados": [
        "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis", "Oracle",
        "SQL Server", "SQLite", "Cassandra", "DynamoDB", "Elasticsearch",
        "Neo4j", "MariaDB", "CouchDB",
    ],
    "Cloud & DevOps": [
        "AWS", "Azure", "Google Cloud", "GCP", "Heroku", "Firebase",
        "Docker", "Kubernetes", "Terraform", "Ansible", "Jenkins",
        "CI/CD", "DevOps", "SRE", "GitOps", "ArgoCD", "Helm",
        "Linux", "Unix", "Bash", "Shell Script",
    ],
    "Data & Analytics": [
        "Data Engineer", "Data Analyst", "Business Intelligence", "BI",
        "Power BI", "Tableau", "Looker", "Metabase",
        "ETL", "Data Pipeline", "Apache Spark", "Apache Kafka",
        "Airflow", "dbt", "Snowflake", "Databricks", "BigQuery",
    ],
    "Machine Learning & AI": [
        "Machine Learning", "Deep Learning", "Data Science", "AI",
        "TensorFlow", "PyTorch", "Keras", "Scikit-learn",
        "NLP", "Computer Vision", "MLOps", "LLM", "GPT",
        "Pandas", "NumPy", "Jupyter",
    ],
    "Arquitetura & Padrões": [
        "Microservices", "REST API", "GraphQL", "gRPC",
        "Software Architecture", "System Design", "Domain Driven Design",
        "Event Driven", "Serverless", "Cloud Native",
    ],
    "Segurança": [
        "Cybersecurity", "Information Security", "Security Engineer",
        "Penetration Testing", "SIEM", "SOC Analyst",
    ],
    "QA & Testing": [
        "QA Engineer", "Test Automation", "Selenium", "Cypress",
        "Jest", "Playwright", "JUnit", "pytest", "SDET",
    ],
    "Cargos (Inglês)": [
        "Software Engineer", "Software Developer", "Full Stack Developer",
        "Frontend Developer", "Backend Developer", "Web Developer",
        "Mobile Developer", "DevOps Engineer", "Cloud Engineer",
        "Data Scientist", "ML Engineer",
        "Site Reliability Engineer", "Platform Engineer",
        "Solutions Architect", "Technical Lead", "Engineering Manager",
        "Product Manager", "Scrum Master", "Agile Coach",
    ],
    "Cargos (Português)": [
        "Desenvolvedor", "Programador", "Analista de Sistemas",
        "Engenheiro de Software", "Desenvolvedor Full Stack",
        "Desenvolvedor Front-End", "Desenvolvedor Back-End",
        "Desenvolvedor Mobile", "Analista de Dados",
        "Cientista de Dados", "Arquiteto de Software",
        "Analista de QA", "Analista de Testes",
        "Administrador de Banco de Dados", "DBA",
        "Analista de Segurança", "Analista DevOps",
    ],
    "Níveis de Experiência": [
        "Junior Developer", "Senior Developer", "Staff Engineer",
        "Principal Engineer", "Tech Lead", "CTO",
        "Desenvolvedor Junior", "Desenvolvedor Pleno", "Desenvolvedor Senior",
        "Estagiário TI", "Trainee",
    ],
}


# Set achatado — fonte de verdade para engines em modo standalone e para
# o filtro do RemoteOK (que precisa de TODAS as stacks de uma vez).
stacks: Set[str] = {s for items in STACK_CATEGORIES.values() for s in items}


# ---------------------------------------------------------------------------
# Iteração em lotes
# ---------------------------------------------------------------------------

def iter_batches(batch_size: int = 10) -> Iterator[Tuple[str, List[str]]]:
    """
    Itera sobre as stacks em lotes que **não cruzam fronteiras de categoria**.

    Cada categoria é fragmentada em pedaços de até ``batch_size``. Quando o
    último pedaço de uma categoria tem menos de ``batch_size``, ele é emitido
    como está — não puxamos stacks da próxima categoria pra completar.

    Args:
        batch_size: tamanho máximo de cada lote (default: 10).

    Yields:
        Tuplas ``(nome_categoria, [stacks])``.

    Exemplo:
        >>> for cat, batch in iter_batches(10):
        ...     print(cat, len(batch))
    """
    if batch_size < 1:
        raise ValueError("batch_size deve ser >= 1")

    for category, items in STACK_CATEGORIES.items():
        for i in range(0, len(items), batch_size):
            yield category, items[i:i + batch_size]


# ---------------------------------------------------------------------------
# Lote ativo — controlado pelo controller
# ---------------------------------------------------------------------------

_active_batch: Optional[Set[str]] = None


def get_active_stacks() -> Set[str]:
    """
    Retorna o lote atual de stacks que as engines devem processar.

    - Em modo batching (controller chamou ``set_active_batch``): devolve só
      as stacks do lote atual.
    - Em modo standalone (engine isolada, ex.: ``python -m src.engines.X``):
      devolve o set ``stacks`` completo.
    """
    return _active_batch if _active_batch is not None else stacks


def set_active_batch(batch: Optional[Iterable[str]]) -> None:
    """
    Define o lote ativo para o ciclo atual. Chamado pelo controller antes
    de disparar as engines.

    Args:
        batch: iterável de stacks. ``None`` desativa o batching (engines
               processam todas as stacks novamente).
    """
    global _active_batch
    _active_batch = set(batch) if batch is not None else None
