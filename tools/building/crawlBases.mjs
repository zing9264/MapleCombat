#!/usr/bin/env node
// 裝備基底爬蟲：拿一份角色名稱清單，批次擷取穿戴中的裝備，收錄「基底」定義，
// 輸出成 app 內建的裝備庫種子資料（src/building/data/itemBases.json）。
//
// 隱私：輸出檔只有道具的基底定義（名稱、部位、等級、白底數值、卷軸格數、出現次數），
// 不含任何角色名稱或 OCID。續爬用的進度檔只存名稱的雜湊值，而且不進版控。
//
// 配額：開發階段金鑰每日 1000 次、每秒 5 次。每位角色耗 2 次（查 OCID + 裝備）。
// 預設每日預算 950 次，用完就存檔結束；隔天執行同一個指令會從中斷處接續。
//
// 用法：
//   NEXON_API_KEY=xxxx node tools/building/crawlBases.mjs --names tools/building/names.txt
//
// 選項：
//   --budget 950     每日請求上限（以台灣時間換日）
//   --stop-dry 50    連續 N 位角色都沒帶來新基底就提早結束（基底很快會飽和）

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const API_BASE = 'https://open.api.nexon.com/maplestorytw/v1'
const OUT_FILE = 'src/building/data/itemBases.json'
const STATE_FILE = 'tools/building/.crawl-state.json'
const THROTTLE_MS = 220
const SAVE_EVERY = 10

/** 只保留這些基底欄位，其餘（total、潛能等）與「基底」無關 */
const BASE_KEYS = [
  'str',
  'dex',
  'int',
  'luk',
  'max_hp',
  'max_mp',
  'attack_power',
  'magic_power',
  'armor',
  'speed',
  'jump',
  'boss_damage',
  'ignore_monster_armor',
  'all_stat',
  'damage',
]

function parseArgs(argv) {
  const args = { budget: 950, stopDry: 0, names: '' }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (flag === '--names') args.names = value
    if (flag === '--budget') args.budget = Number(value)
    if (flag === '--stop-dry') args.stopDry = Number(value)
  }
  return args
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** NEXON 以台灣時間 00:00 換日 */
function todayTST() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

const hashName = (name) => createHash('sha256').update(name).digest('hex').slice(0, 16)

const readJson = (file, fallback) =>
  existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback

class QuotaExhausted extends Error {}
class InvalidKey extends Error {}

function slimOption(option) {
  const result = {}
  for (const key of BASE_KEYS) {
    const value = option?.[key]
    if (value !== undefined && value !== null && Number(value) !== 0) result[key] = String(value)
  }
  return result
}

const isEmpty = (option) => Object.keys(option).length === 0

/**
 * 一件裝備的基底定義。
 * 寶石的數值只存在 item_total_option（四個分層全是 0），這種情況改用 total 當基底。
 */
function toBase(item) {
  const layers = [
    item.item_base_option,
    item.item_starforce_option,
    item.item_etc_option,
    item.item_add_option,
  ].map(slimOption)
  const base = layers.every(isEmpty) ? slimOption(item.item_total_option) : layers[0]
  return {
    name: item.item_name,
    part: item.item_equipment_part,
    level: Number(item.item_base_option?.base_equipment_level ?? 0),
    base,
    scrollSlots: Number(item.scroll_upgrade ?? 0) + Number(item.scroll_upgradeable_count ?? 0),
    seen: 1,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const key = process.env.NEXON_API_KEY
  if (!key) throw new Error('請用環境變數 NEXON_API_KEY 提供金鑰（不要寫進檔案）')
  if (!args.names || !existsSync(args.names)) throw new Error('請用 --names 指定角色名稱清單')

  const names = [
    ...new Set(
      readFileSync(args.names, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#')),
    ),
  ]

  const state = readJson(STATE_FILE, { day: '', used: 0, done: [] })
  if (state.day !== todayTST()) Object.assign(state, { day: todayTST(), used: 0 })
  const done = new Set(state.done)

  const bases = new Map(readJson(OUT_FILE, []).map((b) => [b.name, b]))
  const startCount = bases.size

  async function get(path, params) {
    if (state.used >= args.budget) throw new QuotaExhausted()
    const response = await fetch(`${API_BASE}${path}?${new URLSearchParams(params)}`, {
      headers: { 'x-nxopen-api-key': key },
    })
    state.used += 1
    await sleep(THROTTLE_MS)
    if (response.status === 429) throw new QuotaExhausted()
    if (response.status === 401 || response.status === 403) throw new InvalidKey()
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(body?.error?.name ?? `HTTP ${response.status}`)
      error.status = response.status
      throw error
    }
    return body
  }

  function save() {
    state.done = [...done]
    writeFileSync(STATE_FILE, JSON.stringify(state))
    const list = [...bases.values()].sort(
      (a, b) => a.part.localeCompare(b.part) || b.level - a.level || a.name.localeCompare(b.name),
    )
    writeFileSync(OUT_FILE, `${JSON.stringify(list, null, 2)}\n`)
  }

  let processed = 0
  let skipped = 0
  let dryStreak = 0
  let stopReason = '清單跑完'

  process.on('SIGINT', () => {
    save()
    console.log('\n已中斷並存檔，下次執行會從這裡接續。')
    process.exit(130)
  })

  try {
    for (const name of names) {
      const hash = hashName(name)
      if (done.has(hash)) continue
      if (state.used + 2 > args.budget) {
        stopReason = `今日預算 ${args.budget} 次已用完`
        break
      }

      let added = 0
      try {
        const { ocid } = await get('/id', { character_name: name })
        const { item_equipment: items = [] } = await get('/character/item-equipment', { ocid })
        for (const item of items) {
          if (!item?.item_name) continue
          const existing = bases.get(item.item_name)
          if (existing) {
            existing.seen += 1
          } else {
            bases.set(item.item_name, toBase(item))
            added += 1
          }
        }
        processed += 1
      } catch (error) {
        if (error instanceof QuotaExhausted || error instanceof InvalidKey) throw error
        // 查無角色、改名等個別失敗不影響整批，記為已處理避免重試浪費額度
        skipped += 1
      }

      done.add(hash)
      dryStreak = added ? 0 : dryStreak + 1
      if ((processed + skipped) % SAVE_EVERY === 0) {
        save()
        console.log(
          `進度 ${done.size}/${names.length}　今日已用 ${state.used} 次　基底 ${bases.size} 件`,
        )
      }
      if (args.stopDry && dryStreak >= args.stopDry) {
        stopReason = `連續 ${dryStreak} 位角色沒有新基底，判斷已飽和`
        break
      }
    }
  } catch (error) {
    if (error instanceof QuotaExhausted) stopReason = '今日 API 額度已用完（HTTP 429）'
    else if (error instanceof InvalidKey) stopReason = 'API 金鑰無效或已失效'
    else throw error
  } finally {
    save()
  }

  console.log(`
結束原因：${stopReason}
本次處理 ${processed} 位、跳過 ${skipped} 位　今日已用 ${state.used}/${args.budget} 次
基底 ${startCount} → ${bases.size} 件（新增 ${bases.size - startCount}）
清單剩餘 ${names.length - done.size} 位`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
