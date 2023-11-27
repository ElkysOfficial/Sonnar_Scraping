import aiohttp
import bs4
import asyncio


async def get_indeed_links() -> list:
    url_base = 'https://br.indeed.com/jobs?'
    keywords = ['programador']
    urls = []

    for keyword in keywords:
        for n_page in range(20):
            url = f'{url_base}q={keyword}&limit=50&start={n_page * 50}'
            urls.append(url)

    return urls


async def scraping_indeed(url) -> list:
    jobs = []
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.63 Safari/537.36'}

    async with aiohttp.ClientSession() as session:
        async with session.get(url, headers=headers) as response:
            if response.status == 200:
                html = await response.text()
                soup = bs4.BeautifulSoup(html, 'html.parser')
                cards = soup.find_all('div', 'result')

                for card in cards:
                    job = {}
                    job['title'] = card.find(
                        'span#jobTitle-d57ed1027968462a').text.strip()
                    job['company'] = card.find(
                        'span.css-1x7z1ps.eu4oa1w0').text.strip()
                    job['location'] = card.find(
                        'div.css-t4u72d.eu4oa1w0').text.strip()
                    job['link'] = 'https://br.indeed.com' + \
                        card.find('a')['href']
                    jobs.append(job)
            else:
                print(f'Error: {response.status}')

    return jobs


async def indeed():
    urls = await get_indeed_links()

    tasks = [scraping_indeed(url) for url in urls]
    jobs = await asyncio.gather(*tasks)

    # Deletar código abaixo após testes
    for job_list in jobs:
        for job in job_list:
            print(job)

asyncio.run(indeed())
