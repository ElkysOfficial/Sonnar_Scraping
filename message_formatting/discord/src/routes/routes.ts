import express from "express"
import { createJob, getEmbeds } from "../controllers/controllers"

const router = express.Router()

router.post("/jobs", createJob)
router.get("/embeds", getEmbeds)

export default router
