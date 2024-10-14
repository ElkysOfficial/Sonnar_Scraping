class Job:
    def __init__(self, job_url, job_title, company, location, work_type, hiring_regime, salary, publication_date):
        self.job_url = job_url
        self.job_title = job_title
        self.company = company
        self.location = location
        self.work_type = work_type
        self.hiring_regime = hiring_regime
        self.salary = salary
        self.publication_date = publication_date

    def to_dict(self):
        """
        Retorna um dicionário com os dados da vaga, útil para enviar para o serviço de embedding ou outras operações.
        """
        return {
            'job_url': self.job_url,
            'job_title': self.job_title,
            'company': self.company,
            'location': self.location,
            'work_type': self.work_type,
            'hiring_regime': self.hiring_regime,
            'salary': self.salary,
            'publication_date': self.publication_date
        }