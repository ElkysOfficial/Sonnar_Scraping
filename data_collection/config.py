import subprocess
import sys

def instalador(pacote:str):
   
   subprocess.check_call([sys.executable, "-m", "pip", "install", pacote])

pacotes = ['keyring', 'hikari', 'cloudscraper', 'httpx', 'beautifulsoup4', 'asyncio']

for pacote in pacotes:
    instalador(pacote)

import keyring

def credenciais(servico:str, usuario:str):
    dados = input(f'Serviço: {servico} - Usuário: {usuario}\nInsira os dados: ')
    keyring.set_password(servico, usuario, dados)

servicos = [['discord', 'server-vagas'],
            ['discord', 'server-freelancer'],
            ['discord', 'token']]

for servico in servicos:
    credenciais(servico[0], servico[1])