import express from "express"
import { postEmbeds, getEmbeds, putEmbeds } from "../controllers/controllers"

const router = express.Router()

// Rota para criar um novo embed (POST /embeds)
router.post("/embeds", postEmbeds)

// Rota para obter todos os embeds (GET /embeds)
router.get("/embeds", getEmbeds)

// Rota para atualizar um embed existente (PUT /embeds)
router.put("/embeds", putEmbeds)

// router.delete("/embeds", deleteEmbeds)

export default router
