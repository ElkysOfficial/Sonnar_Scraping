import httpx

async def get_gupy_jobs() -> list:
  '''
  Asynchronous function that returns a list of lists with the following structure:

  [[code, title, company, location, link], [...], [...], ...]

  Each list within the returned list represents a job vacancy published in the Gupy website.
  '''
  
  jobs = []
  stacks = ['python', 'javascript', 'java', 'php', 'desenvolvedor c', 'ruby', 'sql', 'mysql', 'postgresql', 'oracle', 'linux', 'unix', 'aws','azure', 'docker', 'ansible', 'nginx', 'apache', 'sysadmin', 'cloud', 'front-end', 'back-end', 'full-stack','analista ti', 'cibersegurança', 'devops', 'UX & Desing', 'Data Science', 'Mobile', 'QA', 'SAP', 'Mainframe', 'Analista de Dados', 'Analista de Sistemas', 'Analista de Suporte', 'Analista de Testes', 'Pentest', 'Analista de Infraestrutura', 'Analista de Redes', 'Seguranca da Informacao']
  for stack in stacks:
    async with httpx.AsyncClient() as client:
      response = await client.get(f'https://portal.api.gupy.io/api/v1/jobs?jobName={stack}&limit=1000')

      if response.status_code == 200:
        json_response = response.json()

        for job in json_response['data']:
          link = job['jobUrl']
          title = job['name']
          company = job['careerPageName']

          if job['isRemoteWork']:
            location = 'Remoto'
          else:
            location = f'{job['city']} - {job['state']}'
          
          job = [link, title, company, location]

          jobs.append(job)

  return jobs