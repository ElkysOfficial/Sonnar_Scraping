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

          work_type_raw = job.get('workplaceType', '')
          work_type = work_types.get(work_type_raw, work_type_raw) if work_type_raw else ''

          hiring_regime_raw = job.get('type', '')
          hiring_regime = regime_types.get(hiring_regime_raw, hiring_regime_raw) if hiring_regime_raw else ''

          # Localização como lista
          city = job.get('city', '')
          state = job.get('state', '')
          location = []
          if city:
              location.append(city)
          if state:
              location.append(state)

          salary = ""

          # Data de publicação no formato brasileiro DD/MM/YYYY
          date_raw = job.get('publishedDate', '')[:10] if job.get('publishedDate') else ''
          if date_raw and len(date_raw) == 10 and '-' in date_raw:
              parts = date_raw.split('-')
              publication_date = f"{parts[2]}/{parts[1]}/{parts[0]}"
          else:
              publication_date = date_raw

          job_data = [link, title, company, location, work_type, hiring_regime, salary, publication_date]
          jobs.append(job_data)

  print(f'Foram obtidas {len(jobs)} vagas do site Gupy')
  return jobs