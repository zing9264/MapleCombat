#!/usr/bin/env node
// 裝備基底爬蟲：拿一份角色名稱清單，批次擷取穿戴中的裝備，收錄「基底」定義，
// 輸出成 app 內建的裝備庫種子資料（src/building/data/itemBases.json）。
//
// 隱私：輸出檔只有道具的基底定義（名稱、部位、等級、白底數值、卷軸格數、出現次數），
// 不含任何角色名稱或 OCID。續爬用的進度檔只存名稱的雜湊值，而且不進版控。
//
// 配額：開發階段金鑰每日 1000 次、每秒 5 次。每位角色耗 3 次（OCID + 裝備 + 套裝效果）。
// 預設每日預算 800 次，用完就存檔結束；隔天執行同一個指令會從中斷處接續。
// 留下來的 200 次是給你在 app 裡自己同步角色用的，爬蟲不該把額度吃光。
//
// 角色名單來源有兩種，可以併用：
//   --names  一行一個角色名稱
//   --guilds 一行一個「公會名,世界名」。公會端點一次回傳整份成員名單（實測 195 人），
//            2 次請求就能換到近兩百個名字，比逐一查角色划算得多，也不必去爬第三方網站。
//
// 用法：
//   NEXON_API_KEY=xxxx node tools/building/crawlBases.mjs --guilds tools/building/guilds.txt
//
// 選項：
//   --budget 800     每日請求上限（以台灣時間換日）。刻意不用滿 1000 —— 要留一些
//                    給你在 app 裡自己同步角色（一次同步 10 次請求）
//   --redo           清掉進度紀錄，從頭重跑名單（推導規則改了、要重新觀察時用）。
//                    清完之後就照一般方式記錄進度，所以跑到一半沒額度了，
//                    隔天**不要**再帶 --redo，直接跑同一個指令就會從中斷處接續。
//   --stop-dry 50    連續 N 位角色都沒帶來新基底就提早結束（基底很快會飽和）
//   --rebuild        完全不打 API，改用本機快取重建輸出檔
//
// 為什麼要留原始快取：
//   實測踩過一次 —— 早期只存推導後的「卷軸格數」，後來發現那個數字被別人敲過的
//   白金鐵鎚汙染了，想改推導規則卻沒有原始資料，只能重爬 447 個角色。
//   現在每擷取一位就把精簡過的原始回應寫進快取，規則要改時 `--rebuild` 重跑即可，
//   一次 API 都不用打。

import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'

const API_BASE = 'https://open.api.nexon.com/maplestorytw/v1'
const OUT_FILE = 'src/building/data/itemBases.json'
const MEMBERSHIP_FILE = 'src/building/data/setMemberships.json'
const STATE_FILE = 'tools/building/.crawl-state.json'
/**
 * 原始回應快取（JSONL，一行一位角色）。不進版控：雖然已經剝掉名稱只留雜湊，
 * 裝備組合本身仍可能指認到人。
 */
const LINE_BREAK = /\r?\n/
const CACHE_FILE = 'tools/building/.crawl-cache.jsonl'
const THROTTLE_MS = 220

/**
 * 不收錄的部位。
 * 拼圖是商城的額外欄位，變體極多（實測 290 件），會把「基底是否已飽和」的判斷
 * 徹底稀釋掉 —— 一般裝備早就沒有新貨了，拼圖還在一直貢獻「新基底」。
 */
const SKIP_PARTS = new Set(['拼圖'])

/**
 * 飾品類部位。
 * 這些套裝都是「防具＋武器」組成，飾品不會是成員；而「永恆火焰戒指」這種
 * 只是名字剛好以系列名開頭的獨立道具，不排除就會被誤記成套裝成員。
 */
const ACCESSORY_PARTS = new Set([
  '戒指',
  '徽章',
  '墜飾',
  '耳環',
  '腰帶',
  '胸章',
  '勳章',
  '眼飾',
  '臉飾',
  '口袋道具',
  '機器心臟',
  '圖騰',
  '寶石',
  '輔助特殊技能戒指',
])
const SAVE_EVERY = 10

/**
 * 快取要剝掉的欄位：外觀圖與說明文字佔掉絕大部分體積，而且對重建毫無用處。
 * item_icon 留著 —— 它只是 65 字元的 CDN 網址，而且是裝備庫要用的圖。
 * 其餘一律保留 —— 快取的意義就是「之後想改推導規則時還有料可用」，
 * 現在覺得沒用而剝掉的欄位，就是下次重爬的理由。
 */
const CACHE_DROP_KEYS = [
  'item_shape_icon',
  'item_shape_name',
  'item_description',
  'item_gender',
  'item_option_ability',
]

function slimForCache(item) {
  const copy = { ...item }
  for (const key of CACHE_DROP_KEYS) delete copy[key]
  return copy
}

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
  const args = { budget: 800, stopDry: 0, names: '', guilds: '', redo: false, rebuild: false }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (flag === '--names') args.names = value
    if (flag === '--guilds') args.guilds = value
    if (flag === '--budget') args.budget = Number(value)
    if (flag === '--stop-dry') args.stopDry = Number(value)
    if (flag === '--redo') args.redo = true
    if (flag === '--rebuild') args.rebuild = true
  }
  return args
}

/** 讀一份清單檔，去掉空行與 # 註解 */
function readList(file) {
  if (!file || !existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 額度的換日時點。
 *
 * 實測台灣時間 09/12 06:49 額度仍未重置，排除了 00:00 台灣時間（UTC+8）與
 * 00:00 韓國時間（UTC+9）。這裡改以 UTC 換日，但它只是備援 —— 真正的依據是
 * API 每次回應都會帶的 x-ratelimit-remaining。
 */
function today() {
  return new Date().toISOString().slice(0, 10)
}

const hashName = (name) => createHash('sha256').update(name).digest('hex').slice(0, 16)

const readJson = (file, fallback) =>
  existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback

class QuotaExhausted extends Error {}
class InvalidKey extends Error {}

/** API 每次回應都會帶剩餘次數，比自己數準 —— 額度是跟 app 的同步共用的 */
const quota = { limit: null, remaining: null }

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
 * 扣掉白金鐵鎚加開的格數，還原這件裝備原本有幾格。
 *
 * scroll_upgrade + scroll_upgradeable_count 是**當下**的總格數，別人敲過幾次鎚子
 * 會直接算進來。scroll_resilience_count 在實測資料裡是負數，剛好是鐵鎚加開的量。
 * 與 src/building/core/scrollSlots.ts 同一套規則，改動要一起改。
 */
function baseScrollSlots(item) {
  const num = (v) => Number(v ?? 0) || 0
  const current = num(item.scroll_upgrade) + num(item.scroll_upgradeable_count)
  const resilience = num(item.scroll_resilience_count)
  return Math.max(0, current - (resilience < 0 ? -resilience : 0))
}

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
    scrollSlots: baseScrollSlots(item),
    // 圖示是 CDN 網址（65 字元），515 件也才 33KB —— 存起來整個裝備庫就有圖
    icon: item.item_icon ?? '',
    seen: 1,
  }
}

/**
 * 由角色的套裝效果反推裝備歸屬。
 *
 * set-effect 回傳的 set_name 本身就帶職業（例如「永恆套裝(劍士)」），而同一個
 * 角色不可能同時擁有兩個職業版本，因此「該角色有哪個版本」＋「該角色穿了哪些
 * 同系列裝備」就足以直接觀察到歸屬，不必從道具名稱或部位去猜。
 */
function observeSets(items, setEffects) {
  const byFamily = new Map()
  for (const entry of setEffects) {
    const name = entry?.set_name
    if (!name) continue
    const withJob = name.match(/^(.*?)[（(][^（()）]*[)）]\s*$/)
    if (!withJob) continue
    // 套裝叫「永恆套裝(法師)」，道具卻叫「永恆法師褲」——要去掉結尾的
    // 「套裝／套組」才對得上道具名稱的前綴
    const family = withJob[1].replace(/(套裝|套組)$/, '')
    if (family) byFamily.set(family, name)
  }

  const result = new Map()
  for (const item of items) {
    if (!item?.item_name || ACCESSORY_PARTS.has(item.item_equipment_part)) continue
    for (const [family, setName] of byFamily) {
      if (item.item_name.startsWith(family)) result.set(item.item_name, setName)
    }
  }
  return result
}

/**
 * 把一位角色的裝備收進基底庫與套裝歸屬，回傳新增了幾件基底。
 *
 * 抽成函式是為了讓「線上爬取」與「離線重建」走同一段邏輯 ——
 * 兩份實作遲早會分岔，那時重建出來的資料就不等於爬出來的了。
 */
function absorb(items, setEffects, bases, memberships) {
  const observed = observeSets(items, setEffects)
  let added = 0

  for (const item of items) {
    if (!item?.item_name || SKIP_PARTS.has(item.item_equipment_part)) continue
    let entry = bases.get(item.item_name)
    if (entry) {
      entry.seen += 1
      // 鐵鎚只會加格不會減格，所以多看幾個樣本取最小值會收斂到真正的原始格數。
      // 上面的還原已經扣過鐵鎚，這裡是第二層保險 —— 那個欄位的語意是反推的。
      entry.scrollSlots = Math.min(entry.scrollSlots, baseScrollSlots(item))
      // 舊資料沒有圖，之後再看到同一件時補上
      if (!entry.icon && item.item_icon) entry.icon = item.item_icon
    } else {
      entry = toBase(item)
      bases.set(item.item_name, entry)
      added += 1
    }

    const setName = observed.get(item.item_name)
    if (!setName) continue
    const membership = memberships.get(item.item_name)
    if (!membership) {
      memberships.set(item.item_name, {
        itemName: item.item_name,
        setNames: [setName],
        source: 'observed',
      })
    } else if (membership.source === 'observed') {
      if (!membership.setNames.includes(setName)) membership.setNames.push(setName)
    } else {
      // 推論的結果一旦被實際觀察推翻，就整筆換掉
      membership.setNames = [setName]
      membership.source = 'observed'
    }
  }

  return added
}

/**
 * 離線重建：完全不打 API，改用本機快取重新產出輸出檔。
 *
 * 推導規則改了就跑這個 —— 這正是當初沒留快取才得重爬 447 個角色的那件事。
 * 基底從空的開始建，不沿用舊輸出：舊檔裡可能有用舊規則算壞的值，
 * 沿用的話就白重建了。
 */
function rebuild() {
  if (!existsSync(CACHE_FILE)) {
    throw new Error(`找不到快取 ${CACHE_FILE}；先正常跑一次爬蟲才會有原始資料`)
  }

  const bases = new Map()
  const memberships = new Map(
    readJson(MEMBERSHIP_FILE, [])
      // 只留「推論」來的；觀察來的會從快取重新產生
      .filter((m) => m.source !== 'observed')
      .map((m) => [m.itemName, m]),
  )

  // 同一位角色可能被爬過多次（--redo），以最後一筆為準：後面那筆比較新
  const latest = new Map()
  for (const line of readFileSync(CACHE_FILE, 'utf8').split(LINE_BREAK)) {
    if (!line.trim()) continue
    const record = JSON.parse(line)
    latest.set(record.h, record)
  }

  for (const record of latest.values()) {
    absorb(record.items ?? [], record.sets ?? [], bases, memberships)
  }
  const characters = latest.size

  writeOutputs(bases, memberships)
  console.log(`離線重建完成：讀了 ${characters} 筆快取，產出 ${bases.size} 件基底`)
}

/** 兩條路徑共用的輸出格式，避免線上與離線產出的檔案長得不一樣 */
function writeOutputs(bases, memberships) {
  const list = [...bases.values()].sort(
    (a, b) => a.part.localeCompare(b.part) || b.level - a.level || a.name.localeCompare(b.name),
  )
  writeFileSync(OUT_FILE, `${JSON.stringify(list, null, 2)}\n`)

  const membershipList = [...memberships.values()].sort(
    (a, b) => a.setNames[0].localeCompare(b.setNames[0]) || a.itemName.localeCompare(b.itemName),
  )
  writeFileSync(MEMBERSHIP_FILE, `${JSON.stringify(membershipList, null, 2)}\n`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.rebuild) {
    rebuild()
    return
  }

  const key = process.env.NEXON_API_KEY
  if (!key) throw new Error('請用環境變數 NEXON_API_KEY 提供金鑰（不要寫進檔案）')
  if (!args.names && !args.guilds) throw new Error('請用 --names 或 --guilds 指定名單來源')

  const state = readJson(STATE_FILE, { day: '', used: 0, done: [] })
  if (state.day !== today()) Object.assign(state, { day: today(), used: 0 })
  // --redo 是「清一次進度重來」，不是「每次都忽略進度」——
  // 忽略的話跑到一半沒額度，隔天再跑會從頭重複前面那幾百位，白燒額度。
  if (args.redo) state.done = []
  const done = new Set(state.done)

  const bases = new Map(readJson(OUT_FILE, []).map((b) => [b.name, b]))
  // 道具 → 套裝的對照資料庫。實際觀察到的會蓋掉先前用名稱推論的 inferred 項目。
  const memberships = new Map(readJson(MEMBERSHIP_FILE, []).map((m) => [m.itemName, m]))
  const startCount = bases.size

  async function get(path, params) {
    if (state.used >= args.budget) throw new QuotaExhausted()
    const response = await fetch(`${API_BASE}${path}?${new URLSearchParams(params)}`, {
      headers: { 'x-nxopen-api-key': key },
    })
    state.used += 1
    const remaining = Number(response.headers.get('x-ratelimit-remaining'))
    const limit = Number(response.headers.get('x-ratelimit-limit'))
    if (Number.isFinite(remaining)) quota.remaining = remaining
    if (Number.isFinite(limit)) quota.limit = limit
    await sleep(THROTTLE_MS)
    if (response.status === 429) throw new QuotaExhausted()
    if (quota.remaining !== null && quota.remaining <= 0) throw new QuotaExhausted()
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
    writeOutputs(bases, memberships)
  }

  // 公會名單展開成成員名稱。名單只存在記憶體，不落地。
  const names = [...readList(args.names)]
  let fromGuilds = 0
  for (const line of readList(args.guilds)) {
    const [guildName, worldName] = line.split(',').map((part) => part.trim())
    if (!guildName || !worldName) continue
    try {
      const { oguild_id: id } = await get('/guild/id', {
        guild_name: guildName,
        world_name: worldName,
      })
      const guild = await get('/guild/basic', { oguild_id: id })
      const members = guild.guild_member ?? []
      names.push(...members)
      fromGuilds += members.length
      console.log(`公會 ${guildName}（${worldName}）：${members.length} 位成員`)
    } catch (error) {
      if (error instanceof QuotaExhausted || error instanceof InvalidKey) throw error
      console.log(`公會 ${guildName}（${worldName}）查詢失敗：${error.message}`)
    }
  }
  const queue = [...new Set(names)]
  const pending = queue.filter((name) => !done.has(hashName(name))).length

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
    for (const name of queue) {
      const hash = hashName(name)
      if (done.has(hash)) continue
      if (state.used + 3 > args.budget) {
        stopReason = `今日預算 ${args.budget} 次已用完`
        break
      }

      let added = 0
      try {
        const { ocid } = await get('/id', { character_name: name })
        const { item_equipment: items = [] } = await get('/character/item-equipment', { ocid })
        const { set_effect: setEffects = [] } = await get('/character/set-effect', { ocid })
        appendFileSync(
          CACHE_FILE,
          `${JSON.stringify({ h: hash, items: items.map(slimForCache), sets: setEffects })}\n`,
        )
        added += absorb(items, setEffects, bases, memberships)
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
          `進度 ${done.size}/${queue.length}　今日已用 ${state.used} 次　基底 ${bases.size} 件`,
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
本次處理 ${processed} 位、跳過 ${skipped} 位　今日已用 ${state.used}/${args.budget} 次　API 回報剩餘 ${quota.remaining ?? '不明'}/${quota.limit ?? '不明'}
基底 ${startCount} → ${bases.size} 件（新增 ${bases.size - startCount}）
名單共 ${queue.length} 位（公會展開 ${fromGuilds} 位），本次待處理 ${pending} 位`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
