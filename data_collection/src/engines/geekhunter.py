"""
Engine GeekHunter - GraphQL pública (uma chamada cobre tudo).

O GeekHunter expõe a query ``findShowcaseJobs`` que devolve até 1000 vagas
em uma única resposta. Por isso esta engine **não usa batching** - uma
chamada já cobre o catálogo inteiro do site.
"""
from __future__ import annotations
import httpx


# --- Configuração da requisição --------------------------------------------

_GRAPHQL_URL = "https://www.geekhunter.com.br/graphql"

_HEADERS = {
    "Referer": "https://www.geekhunter.com.br/vagas",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Accept": "application/json",
}

_QUERY_BODY = {
    "operationName": "findShowcaseJobs",
    "variables": {
        "showcaseParams": {
            "companyLocation": [],
            "order": "newer",
            "remoteWork": False,
            "pagination": {"page": 0, "perPage": 1000},
        }
    },
    "query": """
    query findShowcaseJobs($showcaseParams: SearchJobFilter!) {
      findShowcaseJobs(showcaseParams: $showcaseParams) {
        data {
          id
          company { name slug }
          city { name }
          cltMaxSalary
          cltMinSalary
          createdAt
          maxSalary
          minSalary
          pjMaxSalary
          pjMinSalary
          usdAnnualSalaryMin
          usdAnnualSalaryMax
          remoteWork
          slug
          title
        }
      }
    }
    """,
}


# --- Função pública --------------------------------------------------------

async def get_geekhunter_jobs(on_job=None) -> list:
    """Coleta vagas do GeekHunter via GraphQL pública (uma chamada).

    Particularidade: a API devolve até 1000 vagas em uma resposta, então
    não há paginação nem iteração por stacks.

    Args:
        on_job: callback opcional ``async fn(parsed)`` invocado a cada vaga
                - usado pelo controller para persistir em streaming.

    Returns:
        Lista no formato canônico ``[link, title, company, location,
        work_type, hiring_regime, salary, publication_date]``.
    """
    jobs = []

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(_GRAPHQL_URL, headers=_HEADERS, json=_QUERY_BODY)
            response.raise_for_status()
            results = (
                response.json()
                .get("data", {})
                .get("findShowcaseJobs", {})
                .get("data", [])
            )

            for result in results:
                job_slug = result.get("slug", "")
                company_obj = result.get("company") or {}
                company_name = (company_obj.get("name") or "").strip()
                company_slug = company_obj.get("slug") or ""

                link = f"https://www.geekhunter.com.br/{company_slug}/jobs/{job_slug}"
                job_title = result.get("title", "")

                # Localização como lista
                city_obj = result.get("city")
                city_name = city_obj.get("name", "") if city_obj else ""
                location = [city_name] if city_name else []

                # Modalidade de trabalho
                is_remote = result.get("remoteWork", False)
                if is_remote:
                    work_type = "Remoto"
                elif city_name:
                    work_type = "Presencial"
                else:
                    work_type = "Remoto"

                # Regime e salário - tenta CLT, PJ, USD e genérico nessa ordem
                hiring_regime = ""
                salary = ""

                clt_min = result.get("cltMinSalary")
                clt_max = result.get("cltMaxSalary")
                pj_min = result.get("pjMinSalary")
                pj_max = result.get("pjMaxSalary")
                usd_min = result.get("usdAnnualSalaryMin")
                usd_max = result.get("usdAnnualSalaryMax")
                generic_min = result.get("minSalary")
                generic_max = result.get("maxSalary")

                if clt_min or clt_max:
                    hiring_regime = "CLT"
                    if clt_min and clt_max:
                        salary = f"R$ {clt_min} - R$ {clt_max}"
                    elif clt_min:
                        salary = f"R$ {clt_min}"
                    elif clt_max:
                        salary = f"R$ {clt_max}"
                elif pj_min or pj_max:
                    hiring_regime = "PJ"
                    if pj_min and pj_max:
                        salary = f"R$ {pj_min} - R$ {pj_max}"
                    elif pj_min:
                        salary = f"R$ {pj_min}"
                    elif pj_max:
                        salary = f"R$ {pj_max}"
                elif usd_min or usd_max:
                    hiring_regime = "Internacional"
                    if usd_min and usd_max:
                        salary = f"USD {usd_min} - USD {usd_max}"
                    elif usd_min:
                        salary = f"USD {usd_min}"
                    elif usd_max:
                        salary = f"USD {usd_max}"
                elif generic_min or generic_max:
                    if generic_min and generic_max:
                        salary = f"R$ {generic_min} - R$ {generic_max}"
                    elif generic_min:
                        salary = f"R$ {generic_min}"
                    elif generic_max:
                        salary = f"R$ {generic_max}"

                # Data ISO → DD/MM/YYYY
                created_at = result.get("createdAt", "")
                date_raw = created_at[:10] if len(created_at) >= 10 else ""
                if date_raw and len(date_raw) == 10 and "-" in date_raw:
                    parts = date_raw.split("-")
                    publication_date = f"{parts[2]}/{parts[1]}/{parts[0]}"
                else:
                    publication_date = date_raw

                job = [link, job_title, company_name, location, work_type,
                       hiring_regime, salary, publication_date]
                jobs.append(job)
                if on_job is not None:
                    try:
                        await on_job(job)
                    except Exception:
                        pass

    except Exception:
        pass

    print(f"Foram obtidas {len(jobs)} vagas do site GeekHunter")
    return jobs


# --- Modo debug ------------------------------------------------------------

if __name__ == "__main__":
    import asyncio

    for j in asyncio.run(get_geekhunter_jobs())[:10]:
        print(j)
