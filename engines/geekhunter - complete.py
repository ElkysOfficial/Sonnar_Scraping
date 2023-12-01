import requests
import json

headers = {
    'accept': '*/*',
    'accept-language': 'pt-BR,pt;q=0.7',
    'authorization': 'Bearer undefined',
    'content-type': 'application/json',
    'sec-ch-ua': '"Brave";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'sec-gpc': '1',
    'Referer': 'https://www.geekhunter.com.br/vagas-python-remoto',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
}

data = {
    'operationName': 'findShowcaseJobs',
    'variables': {
        'showcaseParams': {
            'order': 'newer',
            'remoteWork': False,
            'pagination': {'page': 1, 'perPage': 10},
            'salaryRange': {'min': 0, 'max': 100000},
            'workMode': [],
            'seniority': [],
            'focuses': []
        }
    },
    'query': 'query findShowcaseJobs($showcaseParams: SearchJobFilter!) {\n  findShowcaseJobs(showcaseParams: $showcaseParams) {\n    data {\n      id\n      city {\n        id\n        name\n        __typename\n      }\n      cltMaxSalary\n      cltMinSalary\n      createdAt\n      maxSalary\n      pjMaxSalary\n      pjMinSalary\n      usdAnnualSalaryMin\n      usdAnnualSalaryMax\n      remoteWork\n      slug\n      hideSalary\n      technologies {\n        id\n        name\n        urlPath\n        __typename\n      }\n      title\n      focusId\n      focus {\n        id\n        description\n        __typename\n      }\n      experienceLevel\n      requirements\n      allowApplyFor\n      __typename\n    }\n    __typename\n  }\n}\n'
}

response = requests.post('https://www.geekhunter.com.br/graphql', headers=headers, json=data)

json_response = response.json()

print(json.dumps(json_response, indent=2))