import cloudscraper
from bs4 import BeautifulSoup

def indeed_jobs():
    job_searches = ['python', 'javascript', 'java', 'c++', 'c#', 'c', 'php', 'ruby', 'go', 'swift', 'sql', 'mysql', 'postgresql', 'oracle', 'linux', 'unix', 'aws', 'azure', 'docker', 'ansible', 'nginx', 'apache', 'sysadmin', 'sysops', 'cloud']

    base_url = 'https://br.indeed.com/'
    scraper = cloudscraper.create_scraper()

    for job_search in job_searches:
      for page in range(1):
        url = base_url + f'empregos?q={job_search}&limit=50&start={page*50}&sort=date'
        response = scraper.get(url)
        soup = BeautifulSoup(response.text, 'html.parser')
        cells = soup.find_all('div', class_='job_seen_beacon')

        for cell in cells:
          title = cell.find('h2', class_='jobTitle').text.strip()
          link = cell.find('a').attrs['data-jk']
          url = f'https://br.indeed.com/viewjob?jk={link}'
          company = cell.find('span', class_= 'css-1x7z1ps eu4oa1w0').text.strip()
          location = cell.find('div', {'data-testid': 'text-location'}).text.strip()

          print('-'*50)
          print(f'Título da Vaga: {title}')
          print(f'Comapania: {company}')
          print(f'Local: {location}')
          print(f'Link: {url}')
          print(f'codigo: {link}')
          print('-'*50+'\n')

indeed_jobs()