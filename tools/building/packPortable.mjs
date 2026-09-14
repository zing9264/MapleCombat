#!/usr/bin/env node
// 打包便攜版。
//
// 這支存在的唯一理由：**手動打包會把個人資料一起寄出去**。
// 資料檔是 localStorage 的整包快照（dataFile.ts 的 EXCLUDED_KEYS 刻意留空，
// 因為使用者要的是整台機器共用），裡面就包含 mbNexonApiKey。
// 那個設計的前提是「檔案待在使用者自己的 app data 目錄」—— 一旦打包分享就破功了。
// 實際踩過：連續三個 zip 都帶著金鑰寄出。
//
// 而且不只金鑰：快照裡還有角色名、世界名、公會名與五組完整裝備。
// 金鑰是每個人自己去 openapi.nexon.com 申請的，角色資料是自己同步的，
// 兩者都不該跟著程式走 —— 所以**預設不帶資料檔**，要帶得自己加 --data。
//
// 用法：
//   node tools/building/packPortable.mjs                    # 乾淨的空包（要發布就用這個）
//   node tools/building/packPortable.mjs --data tools/building/.autosave.json
//   node tools/building/packPortable.mjs --out dist-portable

import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

/** 絕對不能進打包檔的鍵。新增憑證類的鍵時記得加進來。 */
const CREDENTIAL_KEYS = ['mbNexonApiKey']

/** 帶著就代表「這包認得出是誰」的欄位。 */
const IDENTITY_FIELDS = new Set(['characterName', 'worldName', 'guildName', 'ocid'])

const EXE_SOURCE = 'src-tauri/target/release/maplebuilding-app.exe'

const README =
  'MapleBuilding v1.0\n\n存檔預設就在這個資料夾裡的 mapledata.json，整個資料夾可以複製到隨身碟帶著走。\n\n想換位置：工具列的「管理 → 存檔位置 → 變更…」，現有的存檔會一起搬過去。\n\n這個資料夾如果寫不進去（例如放在 Program Files），會自動改存到\n%APPDATA%\\tw.maplebuilding.app\\。實際位置在「管理」裡看得到。\n\nNEXON API 金鑰請自己到 https://openapi.nexon.com 申請，貼進工具列的「管理」。\n金鑰不會跟著程式散布，每個人用自己的。\n'

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** 抽掉憑證，回傳 [清乾淨的快照, 被拿掉的鍵] */
export function stripCredentials(snapshot) {
  const keys = { ...(snapshot.keys ?? {}) }
  const removed = CREDENTIAL_KEYS.filter((key) => key in keys)
  for (const key of removed) delete keys[key]
  return [{ ...snapshot, keys }, removed]
}

/** 掃出快照裡的身分欄位（角色名／世界／公會），純粹是提醒用 */
export function findIdentities(keys) {
  const found = new Set()
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit)
    if (!value || typeof value !== 'object') return
    for (const [key, inner] of Object.entries(value)) {
      if (IDENTITY_FIELDS.has(key) && typeof inner === 'string' && inner) {
        found.add(`${key} = ${inner}`)
      }
      visit(inner)
    }
  }
  for (const raw of Object.values(keys)) {
    try {
      visit(JSON.parse(raw))
    } catch {
      // 不是 JSON 的鍵沒有巢狀結構，跳過
    }
  }
  return [...found]
}

function main() {
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version
  const outRoot = resolve(arg('--out', 'dist-portable'))
  const name = `MapleBuilding-${version}-portable`
  const dir = join(outRoot, name)

  if (!existsSync(EXE_SOURCE)) {
    throw new Error(`找不到 ${EXE_SOURCE} —— 先跑 npm run tauri build`)
  }

  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })

  copyFileSync(EXE_SOURCE, join(dir, 'MapleBuilding.exe'))
  writeFileSync(join(dir, '讀我.txt'), README)

  const dataSource = arg('--data')
  if (dataSource) {
    const snapshot = JSON.parse(readFileSync(dataSource, 'utf8'))
    const [clean, removed] = stripCredentials(snapshot)
    writeFileSync(join(dir, 'mapledata.json'), JSON.stringify(clean))
    console.log(`資料檔：${dataSource} → ${Object.keys(clean.keys).length} 個鍵`)
    console.log(removed.length ? `已移除憑證：${removed.join(', ')}` : '沒有憑證需要移除')
    const identities = findIdentities(clean.keys)
    if (identities.length) {
      console.log(`
⚠ 這包帶著個人資料，只適合自己留著，不要發給別人：`)
      for (const line of identities) console.log('   ' + line)
    }
  } else {
    console.log('資料檔：無（乾淨的空包）')
  }

  const zip = join(outRoot, `${name}.zip`)
  rmSync(zip, { force: true })
  execFileSync('powershell.exe', [
    '-NoProfile',
    '-Command',
    `Compress-Archive -Path '${join(dir, '*')}' -DestinationPath '${zip}' -Force`,
  ])

  const bytes = readFileSync(zip)
  console.log(`\n${zip}`)
  console.log(`  ${statSync(zip).size} bytes`)
  console.log(`  sha256 ${createHash('sha256').update(bytes).digest('hex')}`)
}

main()
