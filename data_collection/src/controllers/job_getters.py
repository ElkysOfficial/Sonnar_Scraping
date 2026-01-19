from itertools import cycle
from ..engines.bne import get_bne_jobs
from ..engines.catho import get_catho_jobs
from ..engines.bne import get_bne_jobs
from ..engines.careerjet import get_careerjet_jobs
from ..engines.catho import get_catho_jobs
from ..engines.geekhunter import get_geekhunter_jobs
from ..engines.gupy import get_gupy_jobs
from ..engines.hipsters import get_hipsters_jobs
from ..engines.indeed import get_indeed_jobs
from ..engines.infojobs import get_infojobs_jobs
from ..engines.linkedin import get_linkedin_jobs
from ..engines.programathor import get_programathor_jobs  # falta refatorar
from ..engines.remoteok import get_remoteok_jobs  # testar

getters = [
    get_bne_jobs,
    get_catho_jobs,
    # get_careerjet_jobs,
    get_geekhunter_jobs,
    get_gupy_jobs,
    get_hipsters_jobs,
    get_indeed_jobs,
    get_infojobs_jobs,
    get_linkedin_jobs,
    get_programathor_jobs,
    get_remoteok_jobs,
]
