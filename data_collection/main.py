import asyncio
import csv
from itertools import cycle
import requests
from engines.bne import get_bne_jobs  
from engines.careerjet import get_careerjet_jobs
from engines.catho import get_catho_jobs  
from engines.geekhunter import get_geekhunter_jobs
from engines.gupy import get_gupy_jobs
from engines.hipsters import get_hipsters_jobs
from engines.indeed import get_indeed_jobs
from engines.infojobs import get_infojobs_jobs
from engines.linkedin import get_linkedin_jobs
from engines.programathor import get_programathor_jobs #falta refatorar
from engines.remoteok import get_remoteok_jobs  # testar
from engines.startupjobs import get_startupjobs_jobs
#implementar trabalhabrasil.py
from engines.vagas import get_vagas_jobs #falta refatorar

sent_jobs = set()  
getters = cycle([get_bne_jobs])

async def send_to_embed_service(job_data):
    try:
        response = requests.post('http://localhost:3000/embeds',json=job_data,timeout=10)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        print(f"Erro ao enviar para o serviço de embed: {e}")
        return None

async def main():
    while True:
        for getter in getters:
            try:
                print(f'Buscando em {getter.__name__.split("_")[1]}...')
                results = await getter()
                for result in results:
                    if result[0] not in sent_jobs:
                        job_data = {
                            'job_url': result[0],
                            'job_title': result[1],
                            'company': result[2],
                            'location': result[3],
                            'work_type': result[4],
                            'hiring_regime': result[5],
                            'salary': result[6],
                            'publication_date': result[7],
                        }

                        response = await send_to_embed_service(job_data)
                        if response and response.get("success"):
                            sent_jobs.add(result[0])

                        with open('job_vacancies.csv', 'a+', newline='', encoding='utf-8') as f:
                            csv_writer = csv.writer(f)
                            csv_writer.writerow(result)
                            
                await asyncio.sleep(60)
            except Exception as e:
                print(f'Erro ao buscar em {getter.__name__.split("_")[1]}: {e}')

if __name__ == "__main__":
    asyncio.run(main())
