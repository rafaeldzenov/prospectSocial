import { Router } from 'express'
import { authRoutes } from './auth.routes.js'
import { kanbanRoutes } from './kanban.routes.js'

const routes = Router()

routes.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' })
})

routes.use('/auth', authRoutes)
routes.use('/kanban', kanbanRoutes)

export { routes }
