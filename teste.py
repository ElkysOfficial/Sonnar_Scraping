import asyncio
from curl_cffi import requests
from bs4 import BeautifulSoup

_session = None


def get_session():
    global _session
    if _session is None:
        _session = requests.Session(impersonate='chrome120')
    return _session


async def get_infojobs_links() -> list:
    """
    Coleta links de vagas do InfoJobs com base em stacks.
    """
    links = []
    session = get_session()

    response = await asyncio.to_thread(session.get, 'https://www.msccruzeiros.com.br/', timeout=30)

    if response.status_code == 200:
        soup = BeautifulSoup(response.text, 'html.parser')
        print(soup.prettify())
    else:
        print(f"Erro ao acessar: {response.status_code}")

    return links


if __name__ == "__main__":
    asyncio.run(get_infojobs_links())
