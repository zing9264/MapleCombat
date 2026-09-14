// 洩漏閘門：確認打包產物裡沒有本機的個人資料。
//
// 為什麼不是掃「欄位名稱」而是掃「實際的值」：
//   exe 裡本來就有 characterName、guildName 這些字串 —— 那是程式碼在解析欄位，
//   掃名稱會每次都誤報，誤報久了就沒人看了。
//   改成從本機的 localStorage 備份取出**真正的值**當黑名單，
//   命中就是真的外流，零誤報。
//
// 這道閘門要在主工作樹跑（那裡才有 .autosave.json），
// 而建置本身跑在乾淨的 worktree 裡 —— 兩邊刻意分開。

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 值長度低於這個就不當成秘密。
 *
 * 設 2 而不是更保守的數字：中文角色名常常只有三個字（藜樂拌楓糖 5 字、
 * 優依娜 3 字），門檻設高等於把最該擋的東西放掉。誤報風險由「只看身分欄位
 * 的值」這條規則壓下來，不是靠長度。
 */
const MIN_SECRET_LENGTH = 2

/** 這些鍵的值一律是秘密，不管長相 */
const CREDENTIAL_KEYS = ['mbNexonApiKey']

/** 巢狀 JSON 裡帶身分的欄位 */
const IDENTITY_FIELDS = new Set(['characterName', 'worldName', 'guildName', 'ocid'])

/**
 * 從 localStorage 快照裡挖出所有「不該出現在打包裡」的字串。
 * 回傳 [{ value, label }]，label 用來講清楚命中的是什麼。
 */
export function secretsFrom(snapshot) {
  const found = new Map()
  const add = (value, label) => {
    if (typeof value !== 'string') return
    const trimmed = value.trim()
    if (trimmed.length < MIN_SECRET_LENGTH) return
    if (!found.has(trimmed)) found.set(trimmed, label)
  }

  const keys = snapshot?.keys ?? {}

  for (const key of CREDENTIAL_KEYS) add(keys[key], key)

  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit)
    if (!node || typeof node !== 'object') return
    for (const [field, value] of Object.entries(node)) {
      if (IDENTITY_FIELDS.has(field)) add(value, field)
      visit(value)
    }
  }
  for (const raw of Object.values(keys)) {
    try {
      visit(JSON.parse(raw))
    } catch {
      // 不是 JSON 的鍵沒有巢狀結構
    }
  }

  return [...found].map(([value, label]) => ({ value, label }))
}

/** 遞迴列出資料夾裡的所有檔案 */
export function listFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...listFiles(path))
    else out.push(path)
  }
  return out
}

/**
 * 掃描檔案內容。回傳命中清單，空陣列代表乾淨。
 * 用位元組比對，所以文字檔與 exe 都掃得到。
 */
export function scanFiles(files, secrets) {
  const hits = []
  const needles = secrets.map((secret) => ({
    ...secret,
    bytes: Buffer.from(secret.value, 'utf8'),
  }))

  for (const file of files) {
    const buffer = readFileSync(file)
    for (const needle of needles) {
      if (buffer.includes(needle.bytes)) hits.push({ file, ...needle })
    }
  }
  return hits
}

/** 只准出現這些檔案；多出來的東西一律視為意外帶進去的 */
export const ALLOWED_ENTRIES = new Set(['MapleBuilding.exe', '讀我.txt'])

export function unexpectedEntries(dir) {
  return readdirSync(dir).filter((entry) => !ALLOWED_ENTRIES.has(entry))
}

function main() {
  const [, , packageDir, snapshotPath] = process.argv
  if (!packageDir) {
    console.error('用法：node tools/building/verifyPackage.mjs <打包資料夾> [localStorage 快照]')
    process.exit(2)
  }

  const extras = unexpectedEntries(packageDir)
  if (extras.length) {
    console.error(`✗ 打包裡有不該存在的檔案：${extras.join(', ')}`)
    process.exit(1)
  }

  let secrets = []
  if (snapshotPath) {
    try {
      secrets = secretsFrom(JSON.parse(readFileSync(snapshotPath, 'utf8')))
    } catch {
      console.log(`（讀不到 ${snapshotPath}，跳過個資比對）`)
    }
  }

  if (!secrets.length) {
    console.log('✓ 檔案清單正確；本機沒有可比對的個資快照')
    return
  }

  const hits = scanFiles(listFiles(packageDir), secrets)
  if (hits.length) {
    console.error('✗ 打包裡出現本機個資：')
    for (const hit of hits) console.error(`   ${hit.file} ← ${hit.label}`)
    process.exit(1)
  }

  console.log(`✓ 檔案清單正確；比對 ${secrets.length} 個本機個資字串，全數未出現`)
}

// 直接執行才跑；被測試 import 時不要有副作用
if (import.meta.main) main()
