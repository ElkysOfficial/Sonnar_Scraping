import httpx

async def get_geekhunter_jobs() -> list:
    """
    Returns:
    [[link, title, company, location, work_type, hiring_regime, salary, publication_date], ...]
    """
    jobs = []
    headers = {
        "Referer": "https://www.geekhunter.com.br/vagas",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Accept": "application/json",
    }

    data = {
        "operationName": "findShowcaseJobs",
        "variables": {
            "showcaseParams": {
                "companyLocation": [],
                "order": "newer",
                "remoteWork": False,
                "pagination": {"page": 0, "perPage": 1000},
            }
        },
        "query": """
        query findShowcaseJobs($showcaseParams: SearchJobFilter!) {
          findShowcaseJobs(showcaseParams: $showcaseParams) {
            data {
              id
              company { name slug }
              city { name }
              cltMaxSalary
              cltMinSalary
              createdAt
              maxSalary
              pjMaxSalary
              pjMinSalary
              usdAnnualSalaryMin
              usdAnnualSalaryMax
              remoteWork
              slug
              title
            }
          }
        }
        """,
    }

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post("https://www.geekhunter.com.br/graphql", headers=headers, json=data)
        response.raise_for_status()
        json_response = response.json()
        results = json_response["data"]["findShowcaseJobs"]["data"]

        for result in results:
            job_slug = result["slug"]
            company_obj = result.get("company") or {}
            company = company_obj.get("slug", "")
            company_slug = company_obj.get("slug", "")

            # link correto (como você pediu)
            link = f"https://www.geekhunter.com.br/{company_slug}/jobs/{job_slug}"
            print(link)

            job_title = result["title"]
            location = result["city"]["name"] if result.get("city") else "Remoto"

            work_type = "Remoto" if result.get("remoteWork") else "Hibrido ou Presencial"

            hiring_regime = "Não informado"
            salary = "Não informado"
            if result.get("cltMaxSalary") and result.get("cltMinSalary"):
                hiring_regime = "CLT"
                salary = f"R${result['cltMinSalary']} - R${result['cltMaxSalary']}"
            elif result.get("pjMaxSalary") and result.get("pjMinSalary"):
                hiring_regime = "PJ"
                salary = f"R${result['pjMinSalary']} - R${result['pjMaxSalary']}"
            elif result.get("usdAnnualSalaryMin") and result.get("usdAnnualSalaryMax"):
                hiring_regime = "Internacional"
                salary = f"US${result['usdAnnualSalaryMin']} - US${result['usdAnnualSalaryMax']}"

            created_at = result.get("createdAt", "")
            publication_date = f"{created_at[8:10]}/{created_at[5:7]}/{created_at[0:4]}" if len(created_at) >= 10 else ""

            job = [link, job_title, company, location, work_type, hiring_regime, salary, publication_date]
            jobs.append(job)

    print(f"Foram obtidas {len(jobs)} vagas")
    return jobs

# if __name__ == "__main__":
#     import asyncio

#     jobs = asyncio.run(get_geekhunter_jobs())
#     for job in jobs:
#         print(job)