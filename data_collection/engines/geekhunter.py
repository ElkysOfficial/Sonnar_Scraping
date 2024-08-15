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
        'query': 'query findShowcaseJobs($showcaseParams: SearchJobFilter!) {\n  findShowcaseJobs(showcaseParams: $showcaseParams) {\n    data {\n      city {\n        name}\n      cltMaxSalary\n      cltMinSalary\n      createdAt\n      maxSalary\n      pjMaxSalary\n      pjMinSalary\n      usdAnnualSalaryMin\n      usdAnnualSalaryMax\n      remoteWork\n      slug\n      title\n}}\n}\n'
    }

    async with httpx.AsyncClient() as client:
        response = await client.post('https://www.geekhunter.com.br/graphql', headers=headers, json=data)
        if response.status_code == 200:
            json_response = response.json()
            results = json_response['data']['findShowcaseJobs']['data']

            for result in results:
                link = f"https://www.geekhunter.com.br/vaga/{result['slug']}"
                job_title = result['title']

                # INSERIR A BUSCA DOS CAMPOS ABAIXO:
                company = ""

                location = result['city']['name'] if result['city'] else 'Remoto'

                # INSERIR A BUSCA DOS CAMPOS ABAIXO:
                work_type = result['remoteWork']
                if work_type:
                    work_type = "Remoto"
                else:
                    work_type = "Hibrido ou Presencial"
                
                if result['cltMaxSalary'] and result['cltMinSalary']:
                    hiring_regime = 'CLT'
                    salary = f"R${result['cltMinSalary']} - R${result['cltMaxSalary']}"
                elif result['pjMaxSalary'] and result['pjMinSalary']:
                    hiring_regime = 'PJ'
                    salary = f"R${result['pjMinSalary']} - R${result['pjMaxSalary']}"
                elif result['usdAnnualSalaryMin'] and result['usdAnnualSalaryMax']:
                    hiring_regime = 'Internacional'
                    salary = f"US${result['usdAnnualSalaryMin']} - US${result['usdAnnualSalaryMax']}"

                # INSERIR A BUSCA DOS CAMPOS ABAIXO:
                publication_date = f"{result['createdAt'][8:10]}/{result['createdAt'][5:7]}/{result['createdAt'][0:4]}"
                
                # area = result['focus']['description'] if result['focus'] else 'Não informado'
                job = [link, job_title, company, location, work_type, hiring_regime, salary, publication_date]
                jobs.append(job)
            
    print(f'Foram obtidas {len(jobs)} vagas')
    return jobs
