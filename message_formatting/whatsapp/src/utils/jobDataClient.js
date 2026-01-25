import axios from "axios"

const CORE_BASE_URL = process.env.MESSAGE_FORMATTING_CORE_URL || "http://localhost:3100"
const client = axios.create({ baseURL: CORE_BASE_URL, timeout: 10000 })

export async function fetchJobData() {
  const response = await client.get("/jobs")
  return response.data || []
}

export async function markJobStatus(id, channel, status = true) {
  const response = await client.put("/jobs/status", { id, channel, status })
  return response.data
}
