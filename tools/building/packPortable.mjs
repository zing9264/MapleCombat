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
// 兩者都不該跟著程式走 —— 所以這支**完全沒有帶資料檔的選項**。
// 曾經有過 --data（會剝掉憑證再打包），後來拿掉了：留著那個能力，
// 就等於留著那個洞，而「剝乾淨了嗎」每次都要重新判斷一次。
//
// 用法：
//   node tools/building/packPortable.mjs --out dist-portable
//
// 產物永遠只有 exe 與讀我.txt。要驗證請用 verifyPackage.mjs，
// 發布請用 buildRelease.mjs（從乾淨 clone 建）。

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

const EXE_SOURCE = 'src-tauri/target/release/maplebuilding-app.exe'

const README =
  'MapleBuilding v1.0\n\n存檔預設就在這個資料夾裡的 mapledata.json，整個資料夾可以複製到隨身碟帶著走。\n\n想換位置：工具列的「管理 → 存檔位置 → 變更…」，現有的存檔會一起搬過去。\n\n這個資料夾如果寫不進去（例如放在 Program Files），會自動改存到\n%APPDATA%\\tw.maplebuilding.app\\。實際位置在「管理」裡看得到。\n\nNEXON API 金鑰請自己到 https://openapi.nexon.com 申請，貼進工具列的「管理」。\n金鑰不會跟著程式散布，每個人用自己的。\n'

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
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
