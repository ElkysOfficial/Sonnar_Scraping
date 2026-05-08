from ..engines.bne import get_bne_jobs
from ..engines.careerjet import get_careerjet_jobs
from ..engines.catho import get_catho_jobs
from ..engines.dice import get_dice_jobs
from ..engines.geekhunter import get_geekhunter_jobs
from ..engines.gupy import get_gupy_jobs
from ..engines.indeed import get_indeed_jobs
from ..engines.infojobs import get_infojobs_jobs
from ..engines.jooble import get_jooble_jobs
from ..engines.linkedin import get_linkedin_jobs
from ..engines.michaelpage import get_michaelpage_jobs
from ..engines.programathor import get_programathor_jobs
from ..engines.remoteok import get_remoteok_jobs
from ..engines.remotive import get_remotive_jobs
from ..engines.simplyhired import get_simplyhired_jobs
from ..engines.weworkremotely import get_weworkremotely_jobs
from ..engines.ziprecruiter import get_ziprecruiter_jobs

getters = [
    get_bne_jobs,
    get_careerjet_jobs,
    get_catho_jobs,
    get_dice_jobs,
    get_geekhunter_jobs,
    get_gupy_jobs,
    get_indeed_jobs,
    get_infojobs_jobs,
    get_jooble_jobs,
    # get_linkedin_jobs,
    # get_michaelpage_jobs,
    # get_programathor_jobs,
    # get_remoteok_jobs,
    # get_remotive_jobs,
    # get_simplyhired_jobs,
    # get_weworkremotely_jobs,
    # get_ziprecruiter_jobs,
]
