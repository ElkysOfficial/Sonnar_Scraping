import httpx
from variavel import stacks

async def get_gupy_jobs() -> list:
  '''
  
  '''
  regime_types = {
      "vacancy_type_effective": "Efetivo",
      "vacancy_legal_entity": "Pessoa jurídica",
      "vacancy_type_associate": "Associado",
      "vacancy_type_talent_pool": "Banco de talentos",
      "vacancy_type_lecturer": "Docente",
      "vacancy_type_autonomous": "Autônomo",
      "vacancy_type_temporary": "Temporário",
      "vacancy_type_internship": "Estágio"
  }

  work_types = {
      "remote": "Remoto",
      "hybrid": "Híbrido",
      "on-site": "Presencial"
  }
  
  jobs = []
  for stack in stacks:
    async with httpx.AsyncClient() as client:
      response = await client.get(f'https://portal.api.gupy.io/api/v1/jobs?jobName={stack}&limit=1000')

      if response.status_code == 200:
        json_response = response.json()

        for job in json_response['data']:
          link = job['jobUrl']
          title = job['name']
          company = job['careerPageName']

          work_type = job['workplaceType']
          work_type = work_types.get(work_type, work_type)

          hiring_regime = job['type']
          hiring_regime = regime_types.get(hiring_regime, hiring_regime)

          location = f"{job['city']} - {job['state']}" if job['city'] and job['state'] else ""

          salary = ""

          publication_date = job['publishedDate']

          job = [link, title, company, location, work_type, hiring_regime, salary, publication_date]

          jobs.append(job)

  print(f'Foram obtidas {len(jobs)} vagas')
  return jobs