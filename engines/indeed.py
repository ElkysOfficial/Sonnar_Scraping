import cloudscraper
import httpx
from bs4 import BeautifulSoup
import pandas as pd


def indeed_jobs():
    job_searches = ['python', 'django', 'flask', 'react', 'vue', 'angular', 'java', 'javascript', 'php', 'c#', 'c++', 'c', 'ruby', 'go', 'swift', 'sql', 'mysql', 'mongodb', 'postgresql', 'oracle', 'linux', 'unix', 'windows', 'aws', 'azure', 'docker', 'jenkins', 'ansible', 'puppet', 'elasticsearch', 'kibana', 'logstash', 'grafana', 'zabbix', 'datadog', 'splunk', 'dynatrace', 'appdynamics', 'git', 'github', 'gitlab', 'bitbucket', 'jira', 'confluence', 'slack', 'kafka', 'nginx', 'apache', 'haproxy', 'traefik', 'envoy', 'istio', 'linkerd', 'prometheus', 'grafana', 'kibana', 'elasticsearch', 'logstash', 'datadog', 'new relic', 'splunk', 'sumologic', 'dynatrace', 'appdynamics', 'scrum', 'kanban', 'lean', 'xp', 'sysadmin', 'sysops', 'site reliability engineer', 'site reliability engineering', 'cloud']

    base_url = 'https://br.indeed.com/'
    scraper = cloudscraper.create_scraper()

    for job_search in job_searches:
      for page in range(3):
        print(f'Buscando por: {job_search} na página {page}')
        url = base_url + \
            f'empregos?q={job_search}&limit=50&start={page*50}&sort=date'
        response = scraper.get(url)
        cell = BeautifulSoup(response.text, 'html.parser')
        cell_list = cell.find('ul', {'class': 'jobsearch-ResultsList'})
        cells = cell.findAll('div', {'class': 'job_seen_beacon'})

        for cell in cells:
          title = cell.find('h2', {'class': 'jobTitle'}).text.strip()
          link = cell.find('a').attrs['data-jk']
          url = f'https://br.indeed.com/viewjob?jk={link}'
          company = cell.find('span', {'class': 'css-1x7z1ps eu4oa1w0'}).text.strip()
          location = cell.find('div', {'data-testid': 'text-location'}).text.strip()

          print('-'*50)
          print(f'Título da Vaga: {title}')
          print(f'Comapania: {company}')
          print(f'Local: {location}')
          print(f'Link: {url}')
          print(f'codigo: {link}')
          print('-'*50+'\n')


indeed_jobs()