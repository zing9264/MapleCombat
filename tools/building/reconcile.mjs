import { readFileSync } from 'node:fs'
import { sumOptions } from './parser.mjs'
const LEVEL = 283
const items = JSON.parse(readFileSync(process.argv[2], 'utf8')).item_equipment || []

// 遊戲內套裝視窗實測的件數（API 的 total_set_count 不可信）
const REAL = { '頂級培羅德套裝': 4, '航海師套裝(法師)': 4, '永恆套裝(法師)': 3,
               '漆黑BOSS套裝': 5, '神祕冥界套裝(法師)': 2, '小小時光音樂會套組': 3, '死後世界的的痕跡': 2 }
// 各套裝各階效果（取自遊戲內套裝視窗）
const TIERS = {
  '頂級培羅德套裝':   { 2:{all:20}, 3:{mag:35}, 4:{boss:30} },
  '航海師套裝(法師)': { 2:{mag:20,boss:10}, 3:{all:30,mag:20,boss:10}, 4:{mag:25} },
  '永恆套裝(法師)':   { 2:{mag:40,boss:10}, 3:{all:50,mag:40,boss:10} },
  '漆黑BOSS套裝':     { 2:{all:10,mag:10,boss:10}, 3:{all:10,mag:10}, 4:{all:15,mag:15}, 5:{all:15,mag:15,boss:10} },
  '神祕冥界套裝(法師)': { 2:{mag:30,boss:10}, 3:{mag:30} },
}
let sAll = 0, sMag = 0, sBoss = 0
for (const [name, count] of Object.entries(REAL)) {
  for (const [tier, eff] of Object.entries(TIERS[name] || {})) {
    if (Number(tier) > count) continue
    sAll += eff.all || 0; sMag += eff.mag || 0; sBoss += eff.boss || 0
  }
}

const G = (o, k) => Number(o?.[k] || 0)
let itemInt = 0, itemLuk = 0, itemMag = 0, itemBoss = 0, gemInt = 0
const pot = []
for (const e of items) {
  const gem = e.item_equipment_part === '寶石'
  if (gem) { gemInt += G(e.item_total_option, 'int'); continue }
  itemInt += G(e.item_total_option, 'int'); itemLuk += G(e.item_total_option, 'luk')
  itemMag += G(e.item_total_option, 'magic_power'); itemBoss += G(e.item_total_option, 'boss_damage')
  for (const k of ['potential_option_1','potential_option_2','potential_option_3',
                   'additional_potential_option_1','additional_potential_option_2','additional_potential_option_3'])
    if (e[k]) pot.push(e[k])
}
const p = sumOptions(pot, LEVEL)
const pets = 315

const check = (label, calc, truth) =>
  console.log(`${label.padEnd(26)} 推算 ${String(calc).padStart(6)}   遊戲 ${String(truth).padStart(6)}   ${calc === truth ? '✅' : '❌ 差 ' + (truth - calc)}`)

console.log('套裝合計：全屬性 +' + sAll + '  魔攻 +' + sMag + '  Boss傷 +' + sBoss + '%\n')
check('INT 基本 · 裝備道具', itemInt + (p.flat.int||0) + (p.flat.allStat||0) + sAll, 3854)
check('LUK 基本 · 裝備道具', itemLuk + (p.flat.luk||0) + (p.flat.allStat||0) + sAll, 3065)
check('魔攻 基本 · 裝備道具', itemMag + (p.flat.magicPower||0) + sMag + pets, 3859)
check('Boss傷 · 裝備道具 %', itemBoss + (p.percent.bossDamage||0) + sBoss, 253)
check('INT %未套用 · 裝備道具', gemInt, 1750)
check('魔攻 · 裝備道具 %', p.percent.magicPower||0, 76)
check('LUK · 裝備道具 %', (p.percent.luk||0)+(p.percent.allStat||0)+25, 120)
