import httpx

async def get_geekhunter_jobs() -> list:
    '''
    Asynchronous function that returns a list of lists with the following structure:

    [[code, title, company, location, stack, link], [...], [...], ...]

    Each list within the returned list represents a job vacancy published in the GeekHunter website.
    '''
    jobs = []
    headers = {
        'Referer': 'https://www.geekhunter.com.br/vagas',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
    }
    data = {
        'operationName': 'findShowcaseJobs',
        'variables': {
            'showcaseParams': {
                'companyLocation': [],
                'order': 'newer',
                'remoteWork': False,
                'pagination': {'page': 0, 'perPage': 1000},
            }
        },
        'query': 'query findShowcaseJobs($showcaseParams: SearchJobFilter!) {\n  findShowcaseJobs(showcaseParams: $showcaseParams) {\n    data {\n      id\n      city {\n        id\n        name\n        __typename\n      }\n      technologies {\n        id\n        name\n        urlPath\n        __typename\n      }\n      title\n      focus {\n        id\n        description\n        __typename\n      }\n      slug\n      __typename\n    }\n    __typename\n  }\n}\n'
    }
    async with httpx.AsyncClient() as client:
        response = await client.post('https://www.geekhunter.com.br/graphql', headers=headers, json=data)
        if response.status_code == 200:
            json_response = response.json()
            results = json_response['data']['findShowcaseJobs']['data']

            for result in results:
                link = f"https://www.geekhunter.com.br/vaga/{result['slug']}"
                jobTitle = result['title']

                # INSERIR A BUSCA DOS CAMPOS ABAIXO:
                company = ''

                location = result['city']['name'] if result['city'] else 'Remoto'

                # INSERIR A BUSCA DOS CAMPOS ABAIXO:
                workType = ''
                hiringRegime = ''
                typeOfJourney = ''
                salary = ''

                desiredQualifications = ", ".join([tech['name'] for tech in result['technologies']])

                # INSERIR A BUSCA DOS CAMPOS ABAIXO:
                dateOfPublication = ''
                levelOfExperience = ''

                # area = result['focus']['description'] if result['focus'] else 'Não informado'

                job = [link, jobTitle, company, location, workType, hiringRegime, typeOfJourney, salary, desiredQualifications, dateOfPublication, levelOfExperience]
                jobs.append(job)
            
    return jobs