from urllib.parse import urlparse, urlunparse
import sys
import os

import httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from utils.google_enricher import GoogleEnricher, is_missing_field
from variavel import stacks

HTTPX_TIMEOUT = float(os.getenv("HTTPX_TIMEOUT", "30"))


def _normalize_job_url(url: str) -> str:
  if not url:
    return url
  if not url.startswith("http"):
    url = f"https://{url}"
  parsed = urlparse(url)
  host = parsed.netloc
  if host.endswith(".gupy.io") and "&" in host:
    host = host.split("&", 1)[0] + ".gupy.io"
    parsed = parsed._replace(netloc=host)
    return urlunparse(parsed)
  return url


async def get_gupy_jobs() -> list:
  '''
  
  '''
  regime_types = {
      "vacancy_type_effective": "Efetivo",
      "vacancy_legal_entity": "Pessoa juridica",
      "vacancy_type_associate": "Associado",
      "vacancy_type_talent_pool": "Banco de talentos",
      "vacancy_type_lecturer": "Docente",
      "vacancy_type_autonomous": "Autonomo",
      "vacancy_type_temporary": "Temporario",
      "vacancy_type_internship": "Estagio"
  }

  work_types = {
      "remote": "Remoto",
      "hybrid": "Hibrido",
      "on-site": "Presencial"
  }
  
  jobs = []
  async with httpx.AsyncClient(timeout=HTTPX_TIMEOUT, follow_redirects=True) as client:
    for stack in stacks:
      try:
        response = await client.get(f"https://portal.api.gupy.io/api/v1/jobs?jobName={stack}&limit=1000")
      except httpx.HTTPError:
        continue

      if response.status_code == 200:
        json_response = response.json()

        for job in json_response["data"]:
          link = _normalize_job_url(job.get("jobUrl", ""))
          title = job.get("name", "")
          company = job.get("careerPageName", "")

          work_type_raw = job.get("workplaceType", "")
          work_type = work_types.get(work_type_raw, work_type_raw) if work_type_raw else ""

          hiring_regime_raw = job.get("type", "")
          hiring_regime = regime_types.get(hiring_regime_raw, hiring_regime_raw) if hiring_regime_raw else ""

          city = job.get("city", "")
          state = job.get("state", "")
          if city and state:
            location = f"{city} - {state}"
          else:
            location = city or state

          salary = ""

          # Data de publicacao no formato brasileiro DD/MM/YYYY
          date_raw = job.get("publishedDate", "")[:10] if job.get("publishedDate") else ""
          if date_raw and len(date_raw) == 10 and "-" in date_raw:
            parts = date_raw.split("-")
            publication_date = f"{parts[2]}/{parts[1]}/{parts[0]}"
          else:
            publication_date = date_raw

          job_data = [link, title, company, location, work_type, hiring_regime, salary, publication_date]
          jobs.append(job_data)

  # Enriquecer vagas com location/salary vazios usando Google
  if jobs:
    async with GoogleEnricher() as enricher:
      for job_data in jobs:
        location_str = job_data[3] if isinstance(job_data[3], str) else ", ".join(job_data[3]) if job_data[3] else ""
        needs_location = is_missing_field(location_str)
        needs_salary = is_missing_field(job_data[6])  # salary está no índice 6
        if needs_location or needs_salary:
          enriched = await enricher.enrich_job({
            "company": job_data[2],
            "job_title": job_data[1],
            "location": location_str,
            "salary": job_data[6]
          })
          if needs_location and enriched.get("location"):
            job_data[3] = enriched["location"]
          if needs_salary and enriched.get("salary"):
            job_data[6] = enriched["salary"]

  print(f"Foram obtidas {len(jobs)} vagas do site Gupy")
  return jobs
