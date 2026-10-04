import fs from 'fs'
import path from 'path'
import { app } from 'electron'

const logDir = path.join(app.getPath('userData'), 'logs')
const logFile = path.join(logDir, 'stockflow.log')

function ensureDir() {
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })
}

function formatMsg(level: string, msg: string): string {
  const time = new Date().toISOString().replace('T', ' ').slice(0, 19)
  return `[${time}] [${level}] ${msg}\n`
}

export const logger = {
  info(msg: string) {
    ensureDir()
    fs.appendFileSync(logFile, formatMsg('INFO', msg))
    console.log(msg)
  },
  warn(msg: string) {
    ensureDir()
    fs.appendFileSync(logFile, formatMsg('WARN', msg))
    console.warn(msg)
  },
  error(msg: string, err?: unknown) {
    ensureDir()
    const detail = err instanceof Error ? ` ${err.stack || err.message}` : ''
    fs.appendFileSync(logFile, formatMsg('ERROR', msg + detail))
    console.error(msg, err)
  },
}
