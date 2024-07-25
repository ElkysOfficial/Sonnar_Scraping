import keyring
import hikari
from hikari import intents
import asyncio
import csv

from engines.infojobs import *

getters = [get_infojobs_jobs]
fields = ['LINK', 'TITULO DA VAGA', 'EMPRESA', 'LOCALIDADE', 'MODALIDADE DE TRABALHO',
          'REGIME', 'TIPO DE JORNADA', 'SALÁRIO', 'QUALIFICAÇÕES', 'DATA DE PUBLICAÇÃO']

token = keyring.get_password('discord', 'token')
channel_id = keyring.get_password('discord', 'server-vagas')

try:
    with open('job_vacancies.csv', 'r', newline='', encoding='utf-8') as f:
        csv_reader = csv.reader(f)
        sent_jobs = set(row[0] for row in csv_reader)
except FileNotFoundError:
    sent_jobs = set()

bot = hikari.GatewayBot(token, intents=intents.Intents.ALL)


@bot.listen()
async def on_started(event: hikari.StartedEvent) -> None:
    '''
    Função assíncrona que busca novas vagas a cada 60 segundos e as envia para o canal do Discord.
    A função busca vagas nos seguintes sites:
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
    '''

    for getter in getters:
        try:
            print(f'Iniciando buscas em {getter.__name__.split("_")[1]}...')
            links_das_vagas = await get_infojobs_links()  # Obtém os links das vagas
            
            for link in links_das_vagas:
                try:
                    results = await getter(link[0])
                    for result in results:
                        if result[0] not in sent_jobs:
                            with open('job_vacancies.csv', 'a+', newline='', encoding='utf-8') as f:
                                csv_writer = csv.writer(f)
                                sent_jobs.add(result[0])
                                csv_writer.writerow(result)
                            job_info = f'{"-"*50}\n'
                            for field in range(1, len(fields)):
                                if result[field] != '':job_info += f'{fields[field]}: {result[field]}\n'
                            job_info += f'LINK: {result[0]}'
                            await bot.rest.create_message(channel_id, job_info)
                            await asyncio.sleep(10)
                except Exception as e:
                    print(f'Erro ao processar vaga de {link[0]}: {e}')

            await asyncio.sleep(60)  # Atraso entre as buscas em cada site
        except Exception as e:
            print(f'Erro ao buscar vagas em {getter.__name__.split("_")[1]}: {e}')
            await asyncio.sleep(60)

bot.run()
