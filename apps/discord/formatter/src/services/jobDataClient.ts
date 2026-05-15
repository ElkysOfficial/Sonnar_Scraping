import axios from "axios"
import type { JobChannel, JobData } from "../models/models"

const CORE_BASE_URL = process.env.MESSAGE_FORMATTING_CORE_URL || "http://localhost:3100"
const client = axios.create({ baseURL: CORE_BASE_URL, timeout: 10000 })

export async function fetchJobData(): Promise<JobData[]> {
  const response = await client.get<JobData[]>("/jobs")
  return response.data || []
}

export async function createJobData(payload: Partial<JobData>): Promise<JobData> {
  const response = await client.post<JobData>("/jobs", payload)
  return response.data
}

export async function updateJobStatus(
  id: JobData["id"],
  channel: JobChannel,
  status: boolean
): Promise<{ success: boolean }> {
  const response = await client.put<{ success: boolean }>("/jobs/status", { id, channel, status })
  return response.data
}
