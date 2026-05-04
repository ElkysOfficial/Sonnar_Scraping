"""
Engine Michael Page Brasil - listing por categoria pré-definida.

O Michael Page **não suporta busca por texto livre** - só lista por
categoria (slugs em ``MICHAELPAGE_CATEGORIES``). Por isso esta engine não
participa do batching de stacks: sempre cobre as mesmas 8 categorias.

Cada listing entrega cards com link ``/job-detail/...``. O site não publica
JSON-LD nas listagens, então parseamos diretamente o DOM dos cards.
"""
from __future__ import annotations

import asyncio

import httpx
from bs4 import BeautifulSoup


# --- Configuração ---------------------------------------------------------

# Categorias válidas do Michael Page Brasil (slugs pré-definidos).
MICHAELPAGE_CATEGORIES = [
    "ti-tecnologia",
    "engenharia",
    "financas-contabilidade",
    "vendas",
    "marketing",
    "recursos-humanos",
    "supply-chain",
    "juridico",
]

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
}


# --- Função pública -------------------------------------------------------

async def get_michaelpage_jobs(on_job=None) -> list:
    """Extrai vagas do Michael Page Brasil por categoria pré-definida.

    Args:
        on_job: callback opcional ``async fn(parsed)`` invocado a cada vaga
                emitida - usado pelo controller pra persistir em streaming.

    Returns:
        Lista no formato canônico de 8 campos. ``publication_date`` fica
        vazio (o listing do Michael Page não expõe data).
    """
    jobs = []
    seen_links = set()

    for category in MICHAELPAGE_CATEGORIES:
        try:
            async with httpx.AsyncClient(timeout=30, headers=_HEADERS, follow_redirects=True) as client:
                url = f"https://www.michaelpage.com.br/jobs/{category}"
                response = await client.get(url)

                if response.status_code == 200:
                    soup = BeautifulSoup(response.text, "html.parser")

                    # ESTRATÉGIA PRINCIPAL: links /job-detail/ no DOM.
                    # O Michael Page não usa JSON-LD nas listagens.
                    all_links = soup.find_all("a", href=True)
                    job_detail_links = [
                        a for a in all_links
                        if "/job-detail/" in a.get("href", "")
                    ]

                    for link_elem in job_detail_links:
                        try:
                            href = link_elem.get("href", "")
                            if not href:
                                continue

                            # URL completa
                            if href.startswith("/"):
                                link = f"https://www.michaelpage.com.br{href}"
                            else:
                                link = href

                            # Dedup
                            if link in seen_links:
                                continue
                            seen_links.add(link)

                            # Título: texto do próprio link
                            job_title = link_elem.get_text(strip=True)
                            if not job_title or len(job_title) < 3:
                                continue

                            # Empresa: Michael Page é consultoria - cliente fica oculto
                            company = "Michael Page"

                            # Localização e modalidade - extrair do contexto do <div> pai
                            parent = link_elem.find_parent("div")
                            location_raw = ""
                            work_type = "Presencial"
                            hiring_regime = ""
                            salary = ""

                            if parent:
                                parent_text = parent.get_text(strip=True).lower()

                                # Heurística de cidade
                                if "são paulo" in parent_text:
                                    location_raw = "São Paulo"
                                elif "rio de janeiro" in parent_text:
                                    location_raw = "Rio de Janeiro"

                                # Heurística de work_type
                                if "home office" in parent_text or "remoto" in parent_text:
                                    work_type = "Remoto"
                                elif "híbrido" in parent_text or "hibrido" in parent_text:
                                    work_type = "Híbrido"

                                # Heurística de regime
                                if "permanent" in parent_text or "efetivo" in parent_text:
                                    hiring_regime = "CLT"
                                elif "temporár" in parent_text:
                                    hiring_regime = "Temporário"

                            # Localização como lista
                            title_lower = job_title.lower()
                            if work_type == "Remoto":
                                location = []
                            elif location_raw:
                                location = [location_raw]
                            else:
                                location = []

                            # Override de work_type pelo título (mais confiável)
                            if "remoto" in title_lower or "remote" in title_lower:
                                work_type = "Remoto"
                                location = []
                            elif "híbrido" in title_lower or "hibrido" in title_lower:
                                work_type = "Híbrido"

                            publication_date = ""

                            job = [link, job_title, company, location, work_type,
                                   hiring_regime, salary, publication_date]
                            jobs.append(job)
                            if on_job is not None:
                                try:
                                    await on_job(job)
                                except Exception:
                                    pass

                        except Exception:
                            continue

        except Exception:
            continue

        await asyncio.sleep(0.5)

    print(f"Foram obtidas {len(jobs)} vagas do site MichaelPage")
    return jobs


# --- Modo debug -----------------------------------------------------------

if __name__ == "__main__":
    for j in asyncio.run(get_michaelpage_jobs())[:10]:
        print(j)
