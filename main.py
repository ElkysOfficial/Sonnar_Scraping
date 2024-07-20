import keyring
import hikari
from hikari import intents
import asyncio
import csv

from engines.catho import get_catho_jobs
from engines.geekhunter import get_geekhunter_jobs
from engines.gupy import get_gupy_jobs
from engines.hipsters import get_hipsters_jobs
from engines.indeed import get_indeed_jobs
from engines.infojobs import get_infojobs_jobs
from engines.linkedin import get_linkedin_jobs
from engines.programathor import get_programathor_jobs
from engines.remoteok import get_remoteok_jobs
from engines.vagas import get_vagas_jobs

getters = [get_catho_jobs, get_geekhunter_jobs, get_gupy_jobs, get_hipsters_jobs, get_indeed_jobs, get_infojobs_jobs, get_linkedin_jobs, get_programathor_jobs, get_remoteok_jobs, get_vagas_jobs]
fields = ['LINK', 'TITULO DA VAGA', 'EMPRESA', 'LOCALIDADE', 'MODALIDADE DE TRABALHO', 'REGIME', 'TIPO DE JORANADA', 'SALÁRIO', 'QUALIFICAÇÕES', 'DATA DE PUBLICAÇÃO', 'NÍVEL DE EXPERIÊNCIA']

token = keyring.get_password('discord', 'token')
channel_id = keyring.get_password('discord', 'server-vagas')

try:
    with open ('job_vacancies.csv', 'r', newline='', encoding='utf-8') as f:
        csv_reader = csv.reader(f)
        sent_jobs = set(row[0] for row in csv_reader)
except FileNotFoundError:
    sent_jobs = set()

bot = hikari.GatewayBot(token, intents=intents.Intents.ALL)

@bot.listen()
async def on_started(event: hikari.StartedEvent) -> None:
    '''
    Assynchronous function that searches for new jobs every 60 seconds and sends them to the Discord channel.
    The function searches for vacancies in the following websites:
    * Catho
    * GeekHunter
    * Gupy
    * Hipsters
    * Indeed
    * InfoJobs
    * LinkedIn
    * ProgramaThor
    * RemoteOK
    * Vagas
    * 
    '''
    
    for getter in getters:
        try:
            print(f'Iniciando buscas em {getter.__name__.split('_')[1]}...')
            results = await getter()
            for result in results:
                if result[0] not in sent_jobs:
                    with open ('job_vacancies.csv', 'a+', newline='', encoding='utf-8') as f:
                        csv_writer = csv.writer(f)
                        sent_jobs.add(result[0])
                        csv_writer.writerow(result)
                    job_info = f'{"-"*50}\n'
                    for field in range(1, len(fields)):
                        if result[field] != '':
                            job_info += f'{fields[field]}: {result[field]}\n'
                    job_info += f'LINK: {result[0]}'
                    await bot.rest.create_message(channel_id, job_info)
                    await asyncio.sleep(10)
            await asyncio.sleep(60)
        except Exception as e:
            print(f'Erro ao buscar vagas em {getter.__name__.split('_')[1]}: {e}')
            await asyncio.sleep(60)

bot.run()