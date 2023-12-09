import httpx
from bs4 import BeautifulSoup

async def get_gupy_jobs() -> list:
  
  jobs = []
  stacks = ['python', 'javascript', 'java', 'c++', 'c#', 'c', 'php', 'ruby', 'swift', 'sql', 'mysql', 'postgresql', 'oracle', 'linux', 'unix', 'aws', 'azure', 'docker', 'ansible', 'nginx', 'apache', 'sysadmin', 'cloud', 'front-end', 'back-end', 'full-stack', 'cybersegurança', 'devops', 'pentest']
  
  for stack in stacks:
    async with httpx.AsyncClient() as client:
      response = await client.get(f'https://portal.api.gupy.io/api/v1/jobs?jobName={stack}&limit=1000')

      if response.status_code == 200:
        json_response = response.json()

        for job in json_response['data']:
          code = job['id']
          title = job['name']
          company = job['careerPageName']

          if job['isRemoteWork']:
            location = 'Remoto'
          else:
            location = f'{job['city']} - {job['state']}'
          
          link = job['jobUrl']
          
          job = [code, title, company, location, link]

          jobs.append(job)

    print(f'{stack} - {len(jobs)}')

  return jobs