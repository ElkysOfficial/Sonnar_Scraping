import requests
from bs4 import BeautifulSoup

stacks = ['python', 'javascript', 'java', 'php', 'desenvolvedor c', 'ruby', 'sql', 'mysql', 'postgresql', 'oracle', 'linux', 'unix', 'aws', 'azure', 'docker', 'ansible', 'nginx', 'apache', 'sysadmin', 'cloud', 'front-end', 'back-end', 'full-stack', 'analista ti','cibersegurança', 'devops', 'UX & Desing', 'Data Science', 'Mobile', 'QA', 'SAP', 'Mainframe', 'Analista de Dados', 'Analista de Sistemas', 'Analista de Suporte', 'Analista de Testes', 'Pentest', 'Analista de Infraestrutura', 'Analista de Redes', 'Seguranca da Informacao']


for stack in stacks:
    for page in range(1,9):
        response = requests.get(f'https://www.empregos.com.br/vagas/{stack}/p{page}')
        soup = BeautifulSoup(response.text, 'html.parser')
        cells = soup.find_all('div', class_='descricao grid-12-16')
        for cell in cells:
            title = cell.find('a').get_text(strip=True)
            link = cell.find('a')['href']
            company = cell.find('span', class_='nome-empresa').get_text(strip=True)
            print('-'*50)
            print(title)
            print(company)
            print(link)
            print('-'*50)

