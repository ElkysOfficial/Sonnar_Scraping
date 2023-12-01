import requests
import time

headers = {
    'Referer': 'https://www.geekhunter.com.br/vagas',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
}

data = {
    'operationName': 'findShowcaseJobs',
    'variables': {
        'showcaseParams': {
            'order': 'newer',
            'remoteWork': False,
            'pagination': {'page': 0, 'perPage': 1000},
            'salaryRange': {'min': 0, 'max': 100000},
            'workMode': [],
            'seniority': [],
            'focuses': []
        }
    },
    'query': 'query findShowcaseJobs($showcaseParams: SearchJobFilter!) {\n  findShowcaseJobs(showcaseParams: $showcaseParams) {\n    data {\n      id\n      city {\n        id\n        name\n        __typename\n      }\n      technologies {\n        id\n        name\n        urlPath\n        __typename\n      }\n      title\n      focus {\n        id\n        description\n        __typename\n      }\n      slug\n      __typename\n    }\n    __typename\n  }\n}\n'
}

response = requests.post('https://www.geekhunter.com.br/graphql', headers=headers, json=data)
json_response = response.json()
resultados = json_response['data']['findShowcaseJobs']['data']
for idx,resultado in enumerate (resultados,start=1):
    print(idx)
    titulo = resultado['title']
    local = resultado['city']['name'] if resultado['city'] else 'Remoto'
    stack = ", ".join([tech['name'] for tech in resultado['technologies']])
    area = resultado['focus']['description'] if resultado['focus'] else 'Não informado'
    link = f"https://www.geekhunter.com.br/vaga/{resultado['slug']}"

    print('-'*50)
    print(f'Título da Vaga: {titulo}')
    print(f'Local: {local}')
    print(f'Stack: {stack}')
    print(f'Area: {area}')
    print(f'Link: {link}')
    print('-'*50+'\n')


