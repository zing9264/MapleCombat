// 從 maplestorycube.org 抽出潛能詞條表，產生 src/building/data/potentials.json。
//
// 為什麼用腳本而不是手抄：詞條有 71 種、每種再依 主/附加 × 階級 × 裝備等級 分岔，
// 手抄必錯。站方把資料編進 JS bundle 裡（沒有獨立的 API），所以這裡直接抓 bundle、
// 用括號配對切出那兩個資料物件再求值。
//
// 資料來源：https://maplestorycube.org（社群整理，非官方數據）。
// bundle 檔名帶 hash，會隨站方改版變動，所以先從首頁 HTML 解析出當前檔名。
//
// 用法：node tools/building/fetchPotentials.mjs

import { writeFileSync } from 'node:fs'

const SITE = 'https://maplestorycube.org'

/** 從 pos 開始做括號配對，回傳結束位置（exclusive） */
function matchBracket(text, pos, open, close) {
  let depth = 0
  for (let i = pos; i < text.length; i++) {
    if (text[i] === open) depth++
    else if (text[i] === close) {
      depth--
      if (depth === 0) return i + 1
    }
  }
  throw new Error('括號沒有配對成功')
}

/**
 * 把 `name=` 開頭的那個宣告連同它依賴的前文一起求值。
 *
 * 資料物件之間會互相引用（`INT:tM` 這種別名），所以不能只切出單一物件；
 * 往前找語句起點逐一嘗試，能跑起來的那個就是完整的依賴範圍。
 */
function evaluateRegion(bundle, endPos, returns) {
  const starts = [...bundle.slice(0, endPos).matchAll(/[;}]\s*(?:const|let|var)\s/g)]
    .map((m) => m.index + 1)
    .reverse()
    .slice(0, 60)

  for (const start of starts) {
    try {
      const result = new Function(`${bundle.slice(start, endPos)};return {${returns}};`)()
      if (returns.split(',').every((k) => result[k.trim()] !== undefined)) return result
    } catch {
      // 起點切在運算式中間就會是語法錯誤，換下一個
    }
  }
  throw new Error(`找不到能求值的起點（${returns}）`)
}

const html = await fetch(`${SITE}/probability-search`).then((r) => r.text())
const asset = html.match(/\/assets\/index-[\w-]+\.js/)?.[0]
if (!asset) throw new Error('首頁 HTML 裡找不到 bundle 路徑，站方可能改版了')

const bundle = await fetch(SITE + asset).then((r) => r.text())

// 詞條表：以詞條名稱為 key，值含 main / additional 兩組適用規則
const optionsStart = bundle.indexOf('"INT%":{main:')
if (optionsStart < 0) throw new Error('bundle 裡找不到詞條表')
let objStart = optionsStart
for (let depth = 0; objStart > 0; objStart--) {
  const c = bundle[objStart]
  if (c === '}') depth++
  else if (c === '{') {
    if (depth === 0) break
    depth--
  }
}
const optionsEnd = matchBracket(bundle, objStart, '{', '}')
const optionsVar = bundle.slice(0, objStart).match(/([A-Za-z_$][\w$]*)=$/)?.[1]
if (!optionsVar) throw new Error('找不到詞條表的變數名')

// 裝備種類表
const typesAnchor = bundle.indexOf('name:"機器心臟"')
const typesDecl = bundle.lastIndexOf('=[', typesAnchor)
const typesStart = bundle.indexOf('[', typesDecl)
const typesEnd = matchBracket(bundle, typesStart, '[', ']')
const typesVar = bundle.slice(0, typesDecl).match(/([A-Za-z_$][\w$]*)$/)?.[1]
if (!typesVar) throw new Error('找不到裝備種類表的變數名')

const { [optionsVar]: options } = evaluateRegion(bundle, optionsEnd, optionsVar)

/*
 * 權重表：以「詞條規則 id × 部位群 × 方塊」為鍵，決定這條詞條用該方塊抽不抽得到。
 *
 * 少了它只能列出「型錄上存在的詞條」，跟站方查詢頁對不起來 —— 實測會多出 13 種
 * 抽不到的選項（恢復方塊在傳說階級抽不到「HP恢復道具及恢復技能效果」、武器抽不到
 * 「被擊中時無視傷害」）。
 *
 * 表被拆成 22 組（階級 × 主/附加 × 部位群）散在 bundle 各處，所以逐一掃出來合併。
 */
const weightGroups = []
for (let at = bundle.indexOf('apply:['); at >= 0; at = bundle.indexOf('apply:[', at + 1)) {
  // 往前一個字元就是這個物件的 '{'
  const objStartAt = bundle.lastIndexOf('{', at)
  if (!/^\{\s*apply:\[/.test(bundle.slice(objStartAt, at + 7))) continue
  try {
    const group = new Function(
      `return ${bundle.slice(objStartAt, matchBracket(bundle, objStartAt, '{', '}'))}`,
    )()
    if (Array.isArray(group?.apply) && Array.isArray(group?.data)) weightGroups.push(group)
  } catch {
    // 不是權重表（例如 UI 元件的 props），跳過
  }
}
if (weightGroups.length === 0) throw new Error('bundle 裡找不到權重表')

// 方塊清單（imagePath 指向 bundle 內的圖片變數，求值時會炸，換掉）
const cubesAt = bundle.indexOf('Md=[')
const cubesSrc = bundle
  .slice(bundle.indexOf('[', cubesAt), matchBracket(bundle, bundle.indexOf('[', cubesAt), '[', ']'))
  .replace(/imagePath:[A-Za-z_$][\w$]*/g, 'imagePath:null')
const cubes = new Function(`return ${cubesSrc}`)()
const equipTypes = new Function(`return ${bundle.slice(typesStart, typesEnd)}`)()

const payload = {
  source: SITE,
  note: '社群整理的機率資料，非官方數據。由 tools/building/fetchPotentials.mjs 產生，請勿手改。',
  fetchedAt: new Date().toISOString().slice(0, 10),
  // 這份清單本身就是「哪些部位能上潛能」的答案 —— 不在裡面的（圖騰、寶石、
  // 稱號、機器人、口袋道具…）遊戲設計上就沒有潛能欄，UI 不該給它開。
  equipTypes: equipTypes.map((t) => ({
    name: t.name,
    subcategory: t.subcategory,
    category: t.category,
    features: t.features ?? [],
    commonLevels: t.commonLevels ?? [],
    isFixedLevel: t.isFixedLevel === true,
  })),
  cubes: cubes.map((c) => ({ id: c.id, name: c.name, apply: c.apply })),
  // 攤平成「規則 id → 部位 → 各方塊權重」；0 或缺項代表該方塊抽不到
  weights: (() => {
    const byRule = {}
    for (const group of weightGroups) {
      for (const entry of group.data) {
        const perPart = (byRule[entry.id] ??= {})
        for (const part of group.apply) perPart[part] = entry.weights
      }
    }
    return byRule
  })(),
  options: Object.fromEntries(
    Object.entries(options).map(([name, def]) => [
      name,
      {
        template: def.template,
        field: def.field,
        // id 只是站方的內部識別碼，對我們沒用，剝掉省體積
        // id 要留著（權重表用它對應），overrides 也要 —— 命運武器的數值靠它才會高一階
        main: (def.main ?? []).map(({ id, type, rank, values, overrides }) => ({
          id,
          type,
          rank,
          values,
          overrides,
        })),
        additional: (def.additional ?? []).map(({ id, type, rank, values, overrides }) => ({
          id,
          type,
          rank,
          values,
          overrides,
        })),
      },
    ]),
  ),
}

const out = 'src/building/data/potentials.json'
writeFileSync(out, JSON.stringify(payload, null, 2) + '\n')

const lines = Object.keys(payload.options).length
const types = new Set()
for (const def of Object.values(payload.options)) {
  for (const e of [...def.main, ...def.additional]) types.add(e.type)
}
console.log(`${out}：${lines} 種詞條、${payload.equipTypes.length} 種裝備`)
console.log(`適用標記：${[...types].join('、')}`)
console.log(`權重分組：${weightGroups.length} 組、${Object.keys(payload.weights).length} 條規則`)
