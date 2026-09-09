import { readFileSync } from 'node:fs'
// parser.mjs 由 optionParser.ts 建置而來，見 README
import { sumOptions } from './parser.mjs'
const LEVEL = 283
const items = JSON.parse(readFileSync(process.argv[2], 'utf8')).item_equipment || []
const setJson = JSON.parse(readFileSync(process.argv[3], 'utf8')).set_effect || []
// 寵物裝備：遊戲把它算進「裝備道具」，但它在另一個端點
const petJson = process.argv[4] ? JSON.parse(readFileSync(process.argv[4], 'utf8')) : {}
let petMagic = 0,
  petAtk = 0
for (const n of [1, 2, 3]) {
  for (const o of petJson[`pet_${n}_equipment`]?.item_option || []) {
    if (o.option_type === '魔法攻擊力') petMagic += Number(o.option_value || 0)
    if (o.option_type === '攻擊力') petAtk += Number(o.option_value || 0)
  }
}

// 套裝效果
const setTot = {}
for (const st of setJson) {
  const total = Number(st.total_set_count || 0)
  for (const info of (st.set_effect_info || []).filter((i) => Number(i.set_count) <= total)) {
    for (const raw of String(info.set_option || '').split(/[,\n]/)) {
      const m = raw.trim().match(/^(.+?)\s*\+\s*(\d+(?:\.\d+)?)(%?)$/)
      if (!m) continue
      const k = m[1].trim() + (m[3] === '%' ? '%' : '')
      setTot[k] = (setTot[k] || 0) + Number(m[2])
    }
  }
}

// 裝備：分成「寶石」與其他
const GEM = '寶石'
let opt = { other: {}, gem: {} }
const potLines = []
for (const e of items) {
  const bucket = e.item_equipment_part === GEM ? opt.gem : opt.other
  for (const [k, v] of Object.entries(e.item_total_option || {})) {
    const n = Number(v)
    if (Number.isFinite(n)) bucket[k] = (bucket[k] || 0) + n
  }
  for (const k of [
    'potential_option_1',
    'potential_option_2',
    'potential_option_3',
    'additional_potential_option_1',
    'additional_potential_option_2',
    'additional_potential_option_3',
  ]) {
    if (e[k]) potLines.push(e[k])
  }
}
const p = sumOptions(potLines, LEVEL)

const row = (label, parts, truth) => {
  const sum = parts.reduce((a, b) => a + b[1], 0)
  const diff = truth - sum
  console.log(
    `\n${label}  遊戲: ${truth}   推算: ${sum}   ${diff === 0 ? '✅ 相符' : '❌ 差 ' + diff}`,
  )
  parts.forEach(([n, v]) => console.log(`    ${n.padEnd(22)} ${String(v).padStart(6)}`))
}

row(
  'INT 基本數值 · 裝備道具',
  [
    ['total_option(非寶石)', opt.other.int || 0],
    ['潛能 INT 固定', p.flat.int || 0],
    ['潛能 全屬性 固定', p.flat.allStat || 0],
    ['套裝 全屬性', setTot['全屬性'] || 0],
  ],
  3854,
)

row('INT %未套用 · 裝備道具', [['寶石 total_option', opt.gem.int || 0]], 1750)

row(
  '魔攻 基本數值 · 裝備道具',
  [
    ['total_option(非寶石)', opt.other.magic_power || 0],
    ['潛能 魔攻 固定', p.flat.magicPower || 0],
    ['套裝 魔法攻擊力', setTot['魔法攻擊力'] || 0],
    ['寵物裝備 魔攻', petMagic],
  ],
  3859,
)

row(
  'LUK 基本數值 · 裝備道具',
  [
    ['total_option(非寶石)', opt.other.luk || 0],
    ['潛能 LUK 固定', p.flat.luk || 0],
    ['潛能 全屬性 固定', p.flat.allStat || 0],
    ['套裝 全屬性', setTot['全屬性'] || 0],
  ],
  3065,
)

row(
  'Boss傷 · 裝備道具 %',
  [
    ['total_option boss_damage', opt.other.boss_damage || 0],
    ['潛能 Boss傷', p.percent.bossDamage || 0],
    ['套裝 Boss傷', setTot['攻擊Boss怪物時傷害%'] || 0],
  ],
  253,
)

row(
  '爆傷 · 裝備道具 %',
  [
    ['潛能 爆傷', p.percent.critDamage || 0],
    ['套裝 爆傷', setTot['爆擊傷害%'] || 0],
  ],
  13,
)

row('魔攻 · 裝備道具 %', [['潛能 魔攻%', p.percent.magicPower || 0]], 76)
row(
  'LUK · 裝備道具 %',
  [
    ['潛能 LUK%', p.percent.luk || 0],
    ['潛能 全屬性%', p.percent.allStat || 0],
    ['total_option all_stat%', opt.other.all_stat || 0],
  ],
  120,
)
