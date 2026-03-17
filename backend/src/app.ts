import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import morgan from 'morgan'
import { ZodError } from 'zod'
import { env } from './config/env.js'
import { routes } from './routes/index.js'
import { AppError } from './utils/http.js'

const app = express()

app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  }),
)
app.use(helmet())
app.use(express.json({ limit: '5mb' }))
app.use(morgan('dev'))
app.use('/api', routes)

app.use((err: Error, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  void next
  if (err instanceof ZodError) {
    return res.status(400).json({
      message: 'Payload inválido.',
      issues: err.issues,
    })
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ message: err.message })
  }

  console.error(err)
  return res.status(500).json({ message: 'Erro interno do servidor.' })
})

export { app }
