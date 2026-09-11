#!/usr/bin/env node
// 裝備基底爬蟲：拿一份角色名稱清單，批次擷取穿戴中的裝備，收錄「基底」定義，
// 輸出成 app 內建的裝備庫種子資料（src/building/data/itemBases.json）。
//
// 隱私：輸出檔只有道具的基底定義（名稱、部位、等級、白底數值、卷軸格數、出現次數），
// 不含任何角色名稱或 OCID。續爬用的進度檔只存名稱的雜湊值，而且不進版控。
//
// 配額：開發階段金鑰每日 1000 次、每秒 5 次。每位角色耗 3 次（OCID + 裝備 + 套裝效果）。
// 預設每日預算 950 次，用完就存檔結束；隔天執行同一個指令會從中斷處接續。
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
//   --budget 950     每日請求上限（以台灣時間換日）
//   --redo           忽略進度紀錄，重跑名單上的角色（用來替既有基底補套裝觀察）
//   --stop-dry 50    連續 N 位角色都沒帶來新基底就提早結束（基底很快會飽和）

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const API_BASE = 'https://open.api.nexon.com/maplestorytw/v1'
const OUT_FILE = 'src/building/data/itemBases.json'
const MEMBERSHIP_FILE = 'src/building/data/setMemberships.json'
const STATE_FILE = 'tools/building/.crawl-state.json'
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
  const args = { budget: 950, stopDry: 0, names: '', guilds: '', redo: false }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (flag === '--names') args.names = value
    if (flag === '--guilds') args.guilds = value
    if (flag === '--budget') args.budget = Number(value)
    if (flag === '--stop-dry') args.stopDry = Number(value)
    if (flag === '--redo') args.redo = true
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

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const key = process.env.NEXON_API_KEY
  if (!key) throw new Error('請用環境變數 NEXON_API_KEY 提供金鑰（不要寫進檔案）')
  if (!args.names && !args.guilds) throw new Error('請用 --names 或 --guilds 指定名單來源')

  const state = readJson(STATE_FILE, { day: '', used: 0, done: [] })
  if (state.day !== todayTST()) Object.assign(state, { day: todayTST(), used: 0 })
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

    const membershipList = [...memberships.values()].sort(
      (a, b) => a.setNames[0].localeCompare(b.setNames[0]) || a.itemName.localeCompare(b.itemName),
    )
    writeFileSync(
      MEMBERSHIP_FILE,
      `${JSON.stringify(membershipList, null, 2)}
`,
    )
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
  const pending = queue.filter((name) => args.redo || !done.has(hashName(name))).length

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
      if (!args.redo && done.has(hash)) continue
      if (state.used + 3 > args.budget) {
        stopReason = `今日預算 ${args.budget} 次已用完`
        break
      }

      let added = 0
      try {
        const { ocid } = await get('/id', { character_name: name })
        const { item_equipment: items = [] } = await get('/character/item-equipment', { ocid })
        const { set_effect: setEffects = [] } = await get('/character/set-effect', { ocid })
        const observed = observeSets(items, setEffects)

        for (const item of items) {
          if (!item?.item_name || SKIP_PARTS.has(item.item_equipment_part)) continue
          let entry = bases.get(item.item_name)
          if (entry) {
            entry.seen += 1
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
本次處理 ${processed} 位、跳過 ${skipped} 位　今日已用 ${state.used}/${args.budget} 次
基底 ${startCount} → ${bases.size} 件（新增 ${bases.size - startCount}）
名單共 ${queue.length} 位（公會展開 ${fromGuilds} 位），本次待處理 ${pending} 位`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
