// 從 API 已經撈到的資料推導「戰鬥力基準」的各個來源。
//
// 戰鬥力公式要的是拆開的 基本數值／％／％未套用，而 API 的 final_stat 只給合成後的
// 面板值。但**組成面板的那些來源**我們其實撈得到不少，可以先算出來，讓玩家只需要
// 手填真正推導不了的部分（技能被動、連結技能、聯盟、內在潛能）。
//
// 三個分類不能混：
//   flat    基本數值 —— 會被 ％ 乘上去
//   noApply ％未套用 —— **不會**被 ％ 乘，直接加在最後
//   percent 百分比本身
//
// 分錯的代價很大：符文 11 顆共 INT 24,200，若誤放進 flat，會被將近 700% 的加成
// 乘上去，基準整個報廢。符文的道具說明本身就寫著「利用符文提升的能力不會有
// 能力%增加的效果」，所以它屬於 noApply。

import type { FieldValues } from '@/core/types'
import type { HyperStatEntry, PetInfo, StatEntry, SymbolItem } from '../services/nexonApi'
import type { AggregatedStats } from './equipmentDelta'
import type { StatKey } from './optionParser'
import type { StatSlots } from './powerDelta'

export interface BaselineSource {
  /** 顯示用來源名稱 */
  label: string
  /** 基本數值（吃 ％ 加成） */
  flat: Partial<Record<StatKey, number>>
  /** ％未套用（不吃 ％ 加成） */
  noApply: Partial<Record<StatKey, number>>
  /** 百分比 */
  percent: Partial<Record<StatKey, number>>
  /** 看不懂而沒有計入的項目，必須回報不能靜默丟掉 */
  unrecognized: string[]
  /**
   * 最終傷害 %，僅供來源表顯示。
   *
   * 刻意**不**放進 flat/noApply/percent：終傷是乘算，混進那三個加算的桶子裡
   * 遲早會被當成可以相加的東西。實際計算走 CombatPowerContext.famFinalSources，
   * 這裡只是讓玩家在來源表上看得到它存在 —— 否則萌獸那一列只顯示魔力 14%，
   * 看起來像是終傷沒生效。
   */
  finalDamage?: number
}

function emptySource(label: string): BaselineSource {
  return { label, flat: {}, noApply: {}, percent: {}, unrecognized: [] }
}

function addTo(bucket: Partial<Record<StatKey, number>>, key: StatKey, value: number): void {
  if (!value) return
  bucket[key] = (bucket[key] ?? 0) + value
}

const num = (value: unknown): number => Number(value) || 0

// ── AP 配點 ────────────────────────────────────────

const AP_STATS: ReadonlyArray<[statName: string, key: StatKey]> = [
  ['AP配點STR', 'str'],
  ['AP配點DEX', 'dex'],
  ['AP配點INT', 'int'],
  ['AP配點LUK', 'luk'],
]

/** AP 配點是最單純的基本數值，會吃 ％ 加成 */
export function apBaseline(stat: readonly StatEntry[]): BaselineSource {
  const source = emptySource('AP配點')
  const byName = new Map(stat.map((entry) => [entry.stat_name, entry.stat_value]))
  for (const [statName, key] of AP_STATS) {
    addTo(source.flat, key, num(byName.get(statName)))
  }
  return source
}

// ── 符文 ──────────────────────────────────────────

/**
 * 符文的能力值進 ％未套用。
 * 依據是道具說明本身：「利用符文提升的能力不會有能力%增加的效果」。
 * 力量（symbol_force）與戰鬥力無關，不計入。
 */
export function symbolBaseline(symbols: readonly SymbolItem[]): BaselineSource {
  const source = emptySource('符文')
  for (const symbol of symbols) {
    addTo(source.noApply, 'str', num(symbol.symbol_str))
    addTo(source.noApply, 'dex', num(symbol.symbol_dex))
    addTo(source.noApply, 'int', num(symbol.symbol_int))
    addTo(source.noApply, 'luk', num(symbol.symbol_luk))
  }
  return source
}

// ── 寵物 ──────────────────────────────────────────

/** 寵物裝備的詞條類型 */
const PET_OPTION_TYPES: Record<string, StatKey> = {
  攻擊力: 'attackPower',
  魔法攻擊力: 'magicPower',
  STR: 'str',
  DEX: 'dex',
  INT: 'int',
  LUK: 'luk',
}

/**
 * 寵物裝備的數值算**吃 ％ 的固定值**。
 *
 * 依據是上游公式本身：`adjPetAtk` 是併進 attackBase 之後才乘上 attackPercent 的
 * （見 core/combatPower.ts 的 attackBase / attackTotal）。我們是把欄位餵給同一條
 * 公式，分類就跟著它走，不要自己另立一套。
 */
export function petBaseline(pets: readonly PetInfo[]): BaselineSource {
  const source = emptySource('寵物')
  for (const pet of pets) {
    for (const option of pet.options ?? []) {
      const key = PET_OPTION_TYPES[option.type]
      if (!key) {
        // 沒收錄的詞條要講出來，少算就是基準錯
        source.unrecognized.push(`${pet.name}：${option.type} ${option.value}`)
        continue
      }
      addTo(source.flat, key, num(option.value))
    }
  }
  return source
}

// ── 萌獸 ──────────────────────────────────────────

/**
 * 萌獸的魔力%／物攻% —— **加算**，跟終傷完全不同。
 *
 * 終傷是乘算且要 float32 逐條累加，走 famFinalSources 那條路，不在這裡。
 * 依據是遊戲內魔攻明細：［% 數值］裡「裝備道具 75%」與「萌獸 14%」是兩行，
 * 相加成 89%。
 */
export function familiarBaseline(
  magicPercent: number,
  attackPercent: number,
  finalDamagePercent = 0,
): BaselineSource {
  const source = emptySource('萌獸')
  addTo(source.percent, 'magicPower', num(magicPercent))
  addTo(source.percent, 'attackPower', num(attackPercent))
  // 顯示用；乘算的部分由 famFinalSources 走公式，見 BaselineSource.finalDamage
  source.finalDamage = num(finalDamagePercent)
  return source
}

// ── 極限屬性 ───────────────────────────────────────

/**
 * stat_increase 是自由文字，語序不固定（「增加智力 300」「爆擊傷害10%增加」
 * 「增加攻擊力與魔力15」），連全形斜線與尾隨空白都有。
 * 所以**語意一律看 stat_type，文字只用來取數字** —— 別去理解句子。
 */
interface HyperMapping {
  /** 進 flat 的欄位（吃 ％ 加成） */
  flat?: StatKey[]
  /** 進 noApply 的欄位（不吃 ％ 加成） */
  noApply?: StatKey[]
  /** 進 percent 的欄位 */
  percent?: StatKey[]
  /** 已知但與戰鬥力無關，略過且不算「看不懂」 */
  ignore?: boolean
}

/**
 * 查表前正規化。
 *
 * 實測同一個概念會有不同大小寫：我原本寫 `BOSS傷害`，但 API 實際給的是
 * `Boss傷害`，結果整條 43% 的 BOSS 傷害被當成「看不懂」而漏算。
 * 與其枚舉各種寫法碰運氣，不如統一轉小寫比對 —— 中文不受影響，
 * 只有 ASCII 部分會被正規化。
 */
function normalizeHyperType(type: string): string {
  return String(type ?? '')
    .trim()
    .toLowerCase()
}

/** 鍵一律用正規化後的形式（ASCII 小寫） */
const HYPER_TYPES: Record<string, HyperMapping> = {
  // 主屬的極限屬性進「％未套用」，攻擊力/魔力卻是「基本數值」—— 規則不同，
  // 依據是遊戲內明細：INT 的 150 列在［％未套用數值］，魔攻的 15 列在［基本數值］。
  str: { noApply: ['str'] },
  dex: { noApply: ['dex'] },
  int: { noApply: ['int'] },
  luk: { noApply: ['luk'] },
  // 全形斜線，不是 ASCII 的 /
  '攻擊力／魔力': { flat: ['attackPower', 'magicPower'] },
  傷害: { percent: ['damage'] },
  boss傷害: { percent: ['bossDamage'] },
  一般傷害: { percent: ['normalMobDamage'] },
  爆擊傷害: { percent: ['critDamage'] },
  爆擊機率: { percent: ['critRate'] },
  無視防禦率: { percent: ['ignoreDefense'] },
  防禦力: { flat: ['defense'] },
  最大hp: { flat: ['maxHp'] },
  最大mp: { flat: ['maxMp'] },
  // 以下與戰鬥力無關，已知且刻意略過
  獲得經驗值: { ignore: true },
  楓幣獲得量: { ignore: true },
  道具掉落率: { ignore: true },
  狀態異常耐性: { ignore: true },
  移動速度: { ignore: true },
  跳躍力: { ignore: true },
  提升異常狀態耐性: { ignore: true },
  獲得道具掉落率: { ignore: true },
  神祕力量: { ignore: true },
  真實力量: { ignore: true },
}

/** 從自由文字取第一個數字，支援小數（「獲得經驗值提高10.0%」） */
export function firstNumber(text: string): number {
  const match = /(\d+(?:\.\d+)?)/.exec(String(text ?? ''))
  return match ? Number(match[1]) : 0
}

export function hyperBaseline(entries: readonly HyperStatEntry[]): BaselineSource {
  const source = emptySource('極限屬性')

  for (const entry of entries) {
    if (Number(entry.stat_level) <= 0) continue

    const mapping = HYPER_TYPES[normalizeHyperType(entry.stat_type)]
    if (!mapping) {
      // 沒收錄的類型要講出來，不能當作沒有 —— 少算就是基準錯
      source.unrecognized.push(`${entry.stat_type}：${entry.stat_increase ?? ''}`.trim())
      continue
    }
    if (mapping.ignore) continue

    const value = firstNumber(entry.stat_increase ?? '')
    if (!value) {
      source.unrecognized.push(`${entry.stat_type}：讀不到數值`)
      continue
    }
    for (const key of mapping.flat ?? []) addTo(source.flat, key, value)
    for (const key of mapping.noApply ?? []) addTo(source.noApply, key, value)
    for (const key of mapping.percent ?? []) addTo(source.percent, key, value)
  }

  return source
}

// ── 合併 ──────────────────────────────────────────

export interface CombinedBaseline {
  flat: Partial<Record<StatKey, number>>
  noApply: Partial<Record<StatKey, number>>
  percent: Partial<Record<StatKey, number>>
  unrecognized: string[]
  sources: BaselineSource[]
  /** 終傷總和（%）。乘算，不進上面三個加算的桶子；見 BaselineSource.finalDamage */
  finalDamage: number
}

export function combineBaselines(sources: readonly BaselineSource[]): CombinedBaseline {
  const result: CombinedBaseline = {
    flat: {},
    noApply: {},
    percent: {},
    unrecognized: [],
    sources: [...sources],
    finalDamage: 0,
  }

  for (const source of sources) {
    for (const [key, value] of Object.entries(source.flat)) {
      addTo(result.flat, key as StatKey, num(value))
    }
    for (const [key, value] of Object.entries(source.noApply)) {
      addTo(result.noApply, key as StatKey, num(value))
    }
    for (const [key, value] of Object.entries(source.percent)) {
      addTo(result.percent, key as StatKey, num(value))
    }
    result.unrecognized.push(...source.unrecognized)
    result.finalDamage += num(source.finalDamage)
  }

  return result
}

/**
 * 用基準重建面板值，拿來跟 API 的 final_stat 對帳。
 *
 * 這是整個設計的安全網：玩家手填剩下那幾格時打錯一位數，重建值就對不上，
 * 當場看得出來，而不是把錯誤一路帶進每一次戰鬥力計算。
 * 取整方式與上游公式一致（floorPercentApplied）。
 */
export function rebuildPanelValue(flat: number, percent: number, noApply: number): number {
  return Math.floor((flat * (100 + percent)) / 100) + noApply
}

// ── 裝備 ──────────────────────────────────────────

/**
 * 裝備加總轉成基準來源。裝備的固定值屬於基本數值，會吃 ％ 加成。
 * （與符文相反 —— 符文的道具說明明確排除了 ％ 加成。）
 */
/**
 * 這些部位的固定值**不吃 ％ 加成**，性質與符文相同。
 *
 * 依據是遊戲內 INT 明細 tooltip：「裝備道具」同時出現在［基本數值］3920 與
 * ［％未套用數值］2650 兩個區塊，而 2650 正是寶石（伊妮絲的寶玉）。
 *
 * **圖騰不在此列** —— 它算在［基本數值］裡。三項同時吻合才確定：
 *   INT  3840 ＋ 圖騰 80  ＝ 3920 ✓
 *   LUK  3094 ＋ 圖騰 60  ＝ 3154 ✓
 *   魔攻 3546 ＋ 圖騰 32 ＋ 寵物 315 ＝ 3893 ✓
 */
export const NO_PERCENT_PARTS: ReadonlySet<string> = new Set(['寶石'])

/** 寶石／圖騰這類不吃 ％ 的裝備：固定值進 noApply */
export function flatOnlyEquipmentBaseline(
  stats: AggregatedStats,
  label = '寶石／圖騰',
): BaselineSource {
  const source = emptySource(label)
  for (const [key, value] of Object.entries(stats.flat)) {
    addTo(source.noApply, key as StatKey, num(value))
  }
  for (const [key, value] of Object.entries(stats.percent)) {
    addTo(source.percent, key as StatKey, num(value))
  }
  return source
}

export function equipmentBaseline(stats: AggregatedStats): BaselineSource {
  const source = emptySource('裝備')
  for (const [key, value] of Object.entries(stats.flat)) {
    addTo(source.flat, key as StatKey, num(value))
  }
  for (const [key, value] of Object.entries(stats.percent)) {
    addTo(source.percent, key as StatKey, num(value))
  }
  return source
}

// ── 組裝成公式欄位 ─────────────────────────────────

/**
 * 玩家直接抄遊戲明細的［套用中的數值］。
 *
 * **語意是「覆寫」不是「補差額」**：填了就以填的為準，留空才用自動推導。
 *
 * 為什麼這樣比較好：［套用中的數值］那三個數字本身就是公式要的三個輸入，
 * 照抄即可，不必去判斷明細裡哪幾行已經被自動算掉、哪幾行要相加。
 * 要求使用者做減法既多餘又容易錯 —— 實際發生過（387 對 357）。
 */
export interface ManualBaseline {
  mainFlat: number
  mainPercent: number
  mainNoApply: number
  subFlat: number
  subPercent: number
  subNoApply: number
  atkFlat: number
  atkPercent: number
  atkNoApply: number
  damage: number
  bossDamage: number
  critDamage: number

  /**
   * 明細［基本數值］與［% 數值］裡的「技能」那一行 —— **會從基底扣掉**。
   *
   * 遊戲算戰鬥力時不含技能加成，所以要扣。一度以為該留空（留空時比較接近），
   * 那是因為當時 famFinal 沒接上、特殊項目整組是 0，兩個錯互相抵銷 ——
   * 全部接好之後，填上技能才是精確的：主教 Lv.283 實測 336,871,381，
   * 與遊戲面板一個數字都不差。
   */
  mainSkillFlat: number
  mainSkillPercent: number
  subSkillFlat: number
  subSkillPercent: number
  atkSkillFlat: number
  atkSkillPercent: number
  damageSkill: number
  bossDamageSkill: number
  critDamageSkill: number

  /**
   * 上游「特殊項目」那一組。
   *
   * 這些**不在**遊戲屬性明細的面板值裡，是額外加進公式的項目，所以對帳表
   * 六項全綠也完全看不出少了它們 —— 只有重算的戰鬥力會偏。實測缺這一整組
   * 會高 11.4%（375,224,878 對遊戲的 336,871,381）。
   */
  empressBless: number
  petAtk: number
  eventAtk: number
  eventAllStat: number
  eventBossDmg: number
  eventCritDmg: number
  eventHP: number
  mentorAtk: number
  mentorBossDmg: number
  barrierMainStat: number
  barrierSubStat: number
  barrierAtk: number
  barrierMainStatPercent: number

  /** 武器校正的四個輸入，留空則用 API 推導值（見 core/weaponDerive.ts） */
  weaponStar: number
  weaponScrollAtk: number
  weaponFlameLevel: number
  weaponTotalAtk: number
}

export function emptyManualBaseline(): ManualBaseline {
  return {
    mainFlat: 0,
    mainPercent: 0,
    mainNoApply: 0,
    subFlat: 0,
    subPercent: 0,
    subNoApply: 0,
    atkFlat: 0,
    atkPercent: 0,
    atkNoApply: 0,
    damage: 0,
    bossDamage: 0,
    critDamage: 0,
    mainSkillFlat: 0,
    mainSkillPercent: 0,
    subSkillFlat: 0,
    subSkillPercent: 0,
    atkSkillFlat: 0,
    atkSkillPercent: 0,
    damageSkill: 0,
    bossDamageSkill: 0,
    critDamageSkill: 0,
    empressBless: 0,
    petAtk: 0,
    eventAtk: 0,
    eventAllStat: 0,
    eventBossDmg: 0,
    eventCritDmg: 0,
    eventHP: 0,
    mentorAtk: 0,
    mentorBossDmg: 0,
    barrierMainStat: 0,
    barrierSubStat: 0,
    barrierAtk: 0,
    barrierMainStatPercent: 0,
    weaponStar: 0,
    weaponScrollAtk: 0,
    weaponFlameLevel: 0,
    weaponTotalAtk: 0,
  }
}

/** StatKey 對到 API final_stat 的欄位名稱 */
const PANEL_STAT_NAMES: Partial<Record<StatKey, string>> = {
  str: 'STR',
  dex: 'DEX',
  int: 'INT',
  luk: 'LUK',
  attackPower: '攻擊力',
  magicPower: '魔法攻擊力',
  damage: '傷害',
  bossDamage: 'BOSS怪物傷害',
  critDamage: '爆擊傷害',
}

const pick = (bucket: Partial<Record<StatKey, number>>, key: StatKey): number => bucket[key] ?? 0

/** 玩家填的字串；空字串代表「沒填」，與填 0 意義不同 */
export type ManualInput = Partial<Record<keyof ManualBaseline, string>>

/** 有填就用填的，沒填就用自動推導的 */
function override(entered: string | undefined, derivedValue: number): number {
  const text = String(entered ?? '').trim()
  return text === '' ? derivedValue : Number(text) || 0
}

/** 技能欄位沒有推導值可退，沒填就是 0 */
const plain = (entered: string | undefined): number => Number(String(entered ?? '').trim()) || 0

/**
 * 組成上游戰鬥力公式的欄位。
 *
 * 每一格都是「覆寫」語意：玩家抄了遊戲明細的［套用中的數值］就以那個為準，
 * 留空才退回自動推導。所以沒填也能用（近似），填了就精確。
 *
 * 傷害／BOSS／爆傷不必填：它們沒有基底與 ％ 的交互作用，面板值就是答案，
 * 由呼叫端把 API 的面板值當成預設傳進來。
 */
/**
 * 手填欄位 → 公式欄位。
 *
 * 用來把「留空時會採用的值」倒回來給輸入框當 placeholder：空白的格子不該讓玩家
 * 猜我們偷偷用了什麼（女皇祝福預設 30、P寵攻擊照寵物數推 36，都是有假設的值，
 * 看不到就沒人會去質疑它對不對）。
 *
 * 只列有意義預設值的欄位；技能與終傷留空就是 0，標 placeholder 只是雜訊。
 */
export const MANUAL_TO_FIELD: Partial<Record<keyof ManualBaseline, string>> = {
  mainFlat: 'baseMain',
  mainPercent: 'percentMain',
  mainNoApply: 'noApplyMain',
  subFlat: 'baseSub',
  subPercent: 'percentSub',
  subNoApply: 'noApplySub',
  atkFlat: 'atk',
  atkPercent: 'percentAtk',
  atkNoApply: 'noApplyAtk',
  damage: 'dmg',
  bossDamage: 'bossDmg',
  critDamage: 'critDmg',
  empressBless: 'adjEmpressBless',
  petAtk: 'adjPetAtk',
}

/** 推導得到、但不屬於「面板三欄」的項目 */
export interface DerivedSpecials {
  /** 武器校正值（= 標準武器總攻 − 實際武器總攻），見 core/weaponDerive.ts */
  adjWeaponAtk: number
  /** P寵攻擊：由寵物數推得的套組值 */
  petAtk: number
}

/** 女皇祝福是技能，API 撈不到；上游的預設值就是滿級的 30 */
const EMPRESS_BLESS_DEFAULT = 30

export function assembleFields(
  derived: CombinedBaseline,
  manual: ManualInput,
  slots: StatSlots,
  panel?: ReadonlyMap<string, number>,
  specials?: DerivedSpecials,
): FieldValues {
  const panelOf = (key: StatKey): number => {
    const name = PANEL_STAT_NAMES[key]
    return name ? (panel?.get(name) ?? pick(derived.percent, key)) : pick(derived.percent, key)
  }

  return {
    baseMain: override(manual.mainFlat, pick(derived.flat, slots.main)),
    percentMain: override(manual.mainPercent, pick(derived.percent, slots.main)),
    noApplyMain: override(manual.mainNoApply, pick(derived.noApply, slots.main)),

    baseSub: override(manual.subFlat, pick(derived.flat, slots.sub)),
    percentSub: override(manual.subPercent, pick(derived.percent, slots.sub)),
    noApplySub: override(manual.subNoApply, pick(derived.noApply, slots.sub)),

    atk: override(manual.atkFlat, pick(derived.flat, slots.attack)),
    percentAtk: override(manual.atkPercent, pick(derived.percent, slots.attack)),
    noApplyAtk: override(manual.atkNoApply, pick(derived.noApply, slots.attack)),

    dmg: override(manual.damage, panelOf('damage')),
    bossDmg: override(manual.bossDamage, panelOf('bossDamage')),
    critDmg: override(manual.critDamage, panelOf('critDamage')),

    /**
     * 上游 resolveFamMult(sources, famFinal) 的約定：sources 是 famFinal 這個總值的
     * 逐條拆解，對不上的差額會被補成一條額外來源。所以只送 sources、讓 famFinal
     * 留 0 時，它會補上一條 −20% 把萌獸的 +20% 整個抵銷掉 —— 終傷完全沒生效，
     * 畫面上卻照常顯示「終傷 20%」，看不出來。實際踩過這個坑。
     */
    /**
     * 終傷總值。**必須跟 ctx.famFinalSources 的總和一致**（見下面的說明）。
     *
     * 這裡只有萌獸 —— 公式裡的另外兩個終傷來源（創世武器 10%、惡魔殺手的
     * ruinFinal）是乘數，由 ctx 處理。刻意**不**開一格「其他終傷」給玩家填：
     * 唯一看起來能填的數字是面板的「最終傷害 300.19%」，而那是所有來源合成
     * 後的結果，填進來會跟自動帶入的部分重複相乘 —— 實際被填錯過一次。
     */
    famFinal: derived.finalDamage,

    // ── 上游「特殊項目」。缺這一整組實測會高 11.4%，見 ManualBaseline 的說明 ──
    adjWeaponAtk: specials?.adjWeaponAtk ?? 0,
    adjEmpressBless: override(manual.empressBless, EMPRESS_BLESS_DEFAULT),
    adjPetAtk: override(manual.petAtk, specials?.petAtk ?? 0),
    adjEventAtk: plain(manual.eventAtk),
    adjEventAllStat: plain(manual.eventAllStat),
    adjEventBossDmg: plain(manual.eventBossDmg),
    adjEventCritDmg: plain(manual.eventCritDmg),
    adjEventHP: plain(manual.eventHP),
    adjMentorAtk: plain(manual.mentorAtk),
    adjMentorBossDmg: plain(manual.mentorBossDmg),
    adjBarrierMainStat: plain(manual.barrierMainStat),
    adjBarrierSubStat: plain(manual.barrierSubStat),
    adjBarrierAtk: plain(manual.barrierAtk),
    adjBarrierMainStatPercent: plain(manual.barrierMainStatPercent),

    // 技能：公式會把這些從基底扣掉（見 ManualBaseline 上的說明）
    skillBaseMain: plain(manual.mainSkillFlat),
    skillPercentMain: plain(manual.mainSkillPercent),
    skillBaseSub: plain(manual.subSkillFlat),
    skillPercentSub: plain(manual.subSkillPercent),
    skillAtk: plain(manual.atkSkillFlat),
    skillPercentAtk: plain(manual.atkSkillPercent),
    skillDmg: plain(manual.damageSkill),
    skillBossDmg: plain(manual.bossDamageSkill),
    skillCritDmg: plain(manual.critDamageSkill),
  }
}

// ── 對帳 ──────────────────────────────────────────

export interface PanelCheck {
  label: string
  /** 用基準重建出來的值 */
  rebuilt: number
  /** API 面板上的值 */
  panel: number
  diff: number
  ok: boolean
}

/**
 * 拿組裝好的基準重建面板值，跟 API 的 final_stat 比對。
 *
 * 這是整個做法的安全網。基準有一部分得靠手填，手填就會打錯；對帳讓錯誤
 * **當場現形**，而不是安靜地污染之後每一次戰鬥力計算。
 * 對不上通常代表漏了某個來源（技能、聯盟…）或數字打錯。
 */
export function panelChecks(
  fields: FieldValues,
  slots: StatSlots,
  panel: ReadonlyMap<string, number>,
): PanelCheck[] {
  const rows: Array<[label: string, key: StatKey, flat: string, percent: string, noApply: string]> =
    [
      ['主屬', slots.main, 'baseMain', 'percentMain', 'noApplyMain'],
      ['副屬', slots.sub, 'baseSub', 'percentSub', 'noApplySub'],
      ['攻擊力', slots.attack, 'atk', 'percentAtk', 'noApplyAtk'],
      // 傷害類沒有基底／％ 的交互作用，整個值就是一個百分比，
      // 所以放在 noApply 欄位、base 與 percent 留空即可重建。
      ['傷害', 'damage', '', '', 'dmg'],
      ['BOSS傷害', 'bossDamage', '', '', 'bossDmg'],
      ['爆擊傷害', 'critDamage', '', '', 'critDmg'],
    ]

  return rows.flatMap(([label, key, flatId, percentId, noApplyId]) => {
    const statName = PANEL_STAT_NAMES[key]
    if (!statName) return []
    const panelValue = panel.get(statName)
    if (panelValue === undefined) return []

    const rebuilt = rebuildPanelValue(
      fields[flatId] ?? 0,
      fields[percentId] ?? 0,
      fields[noApplyId] ?? 0,
    )
    return [
      {
        label: `${label}（${statName}）`,
        rebuilt,
        panel: panelValue,
        diff: rebuilt - panelValue,
        ok: rebuilt === panelValue,
      },
    ]
  })
}
