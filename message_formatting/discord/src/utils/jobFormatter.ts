import Job from "../models/models"

export function jobDataToEmbed(jobData) {
  const job = new Job({
    job_title: jobData.job_title,
    job_url: jobData.job_url,
    company: jobData.company,
    location: jobData.location,
    hiring_regime: jobData.hiring_regime,
    work_type: jobData.work_type,
    salary: jobData.salary,
    publication_date: jobData.publication_date
  })

  const embed = job.toEmbed().toJSON()
  return {
    ...embed,
    id: jobData.id,
    sending: jobData.statuses?.discord ? "true" : "false",
    whatsappSent: jobData.statuses?.whatsapp || false,
    telegramSent: jobData.statuses?.telegram || false
  }
}
