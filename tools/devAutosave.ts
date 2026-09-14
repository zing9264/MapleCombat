// 開發伺服器的自動備份端點。
//
// 為什麼需要：預覽視窗的 localStorage 會在重開機、或視窗關掉重開時拿到全新的
// 儲存分割區，整份資料無聲消失。實際發生過兩次，第二次把玩家手抄了半天的
// 戰鬥力基準（24 個數字）也一起帶走。桌面版有資料檔擋著，瀏覽器沒有。
//
// 只在 `vite dev` 生效，備份寫在 gitignore 的檔案裡。正式版不受影響 ——
// 那邊本來就有匯出／匯入與桌面資料檔。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Plugin } from 'vite'

const ENDPOINT = '/__mb-autosave'
const FILE = 'tools/building/.autosave.json'
/** 備份檔可能很大（裝備快照含圖示），但不該無上限 */
const MAX_BYTES = 8 * 1024 * 1024

export function devAutosave(): Plugin {
  return {
    name: 'mb-dev-autosave',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(ENDPOINT, (req, res) => {
        if (req.method === 'GET') {
          const body = existsSync(FILE) ? readFileSync(FILE, 'utf8') : 'null'
          res.setHeader('content-type', 'application/json')
          res.end(body)
          return
        }

        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }

        let text = ''
        let tooBig = false
        req.on('data', (chunk) => {
          if (tooBig) return
          text += chunk
          if (text.length > MAX_BYTES) {
            tooBig = true
            text = ''
          }
        })
        req.on('end', () => {
          if (tooBig) {
            res.statusCode = 413
            res.end()
            return
          }
          try {
            // 先 parse 一次確認不是半截資料 —— 寫進壞掉的備份比沒有備份更糟
            JSON.parse(text)
            mkdirSync(dirname(FILE), { recursive: true })
            writeFileSync(FILE, text)
            res.statusCode = 204
          } catch {
            res.statusCode = 400
          }
          res.end()
        })
      })
    },
  }
}
