// 潛能／附加潛能字串解析器。
//
// NEXON API 的潛能是自由文字（"INT +10%"、"以角色等級為準每9級 INT +1"），
// 要做換裝比較就得先把它們變成可加總的數值。
//
// 設計原則：解析不出來的字串**不會被丟掉**，而是標成 recognized: false 回傳。
// 這個工具的價值在數字準確，寧可讓使用者看到「有 2 條沒認出來」，
// 也不要安靜地少算。

/** 會影響戰鬥力的能力值種類 */
export type StatKey =
  | 'str'
  | 'dex'
  | 'int'
  | 'luk'
  | 'allStat'
  | 'maxHp'
  | 'maxMp'
  | 'attackPower'
  | 'magicPower'
  | 'damage'
  | 'bossDamage'
  | 'critDamage'
  | 'critRate'
  | 'ignoreDefense'
  | 'normalMobDamage'
  | 'defense'
  | 'speed'
  | 'jump'
  | 'mesoRate'
  | 'dropRate'
  | 'cooldown'
  | 'skillLevel'
  | 'misc'

/** 這些能力值是乘法疊加，不能直接相加 */
export const MULTIPLICATIVE_STATS: ReadonlySet<StatKey> = new Set<StatKey>(['ignoreDefense'])

/** 對戰鬥力沒有貢獻的能力值，加總時可略過 */
export const NON_COMBAT_STATS: ReadonlySet<StatKey> = new Set<StatKey>([
  'speed',
  'jump',
  'mesoRate',
  'dropRate',
  'defense',
  'misc',
])

const STAT_NAMES: ReadonlyArray<[string, StatKey]> = [
  ['STR', 'str'],
  ['DEX', 'dex'],
  ['INT', 'int'],
  ['LUK', 'luk'],
  ['全屬性', 'allStat'],
  ['MaxHP', 'maxHp'],
  ['MaxMP', 'maxMp'],
  ['最大HP', 'maxHp'],
  ['最大MP', 'maxMp'],
  ['魔法攻擊力', 'magicPower'],
  ['攻擊力', 'attackPower'],
  ['攻擊Boss怪物時傷害', 'bossDamage'],
  ['攻擊BOSS怪物時傷害', 'bossDamage'],
  ['BOSS怪物傷害', 'bossDamage'],
  ['一般怪物攻擊時傷害', 'normalMobDamage'],
  ['一般怪物傷害', 'normalMobDamage'],
  ['無視怪物防禦率', 'ignoreDefense'],
  ['無視防禦率', 'ignoreDefense'],
  ['爆擊傷害', 'critDamage'],
  ['爆擊機率', 'critRate'],
  ['傷害', 'damage'],
  ['防禦力', 'defense'],
  ['移動速度', 'speed'],
  ['跳躍力', 'jump'],
  ['楓幣獲得量', 'mesoRate'],
  ['道具掉落率', 'dropRate'],
  ['技能冷卻時間', 'cooldown'],
  ['所有技能等級', 'skillLevel'],
  ['HP恢復道具及恢復技能效率', 'misc'],
]

/**
 * 名稱比對必須「長的優先」：
 * 「魔法攻擊力」含有「攻擊力」，若先比對到後者會把魔攻誤判成物攻。
 */
const SORTED_STAT_NAMES = [...STAT_NAMES].sort((a, b) => b[0].length - a[0].length)

export interface ParsedOption {
  /** 原始字串，保留供除錯與 UI 顯示 */
  raw: string
  stat: StatKey
  /** flat=固定值、percent=百分比、perLevel=依角色等級換算的固定值 */
  kind: 'flat' | 'percent' | 'perLevel'
  value: number
  /** perLevel 專用：每幾級獲得一次 value */
  per: number
  recognized: boolean
}

const PER_LEVEL_RE = /^以角色等級為準每\s*(\d+)\s*級\s*(.+?)\s*\+\s*(\d+(?:\.\d+)?)$/
const PERCENT_RE = /^(.+?)\s*\+\s*(\d+(?:\.\d+)?)\s*%$/
const FLAT_RE = /^(.+?)\s*\+\s*(\d+(?:\.\d+)?)$/

function matchStat(label: string): StatKey | null {
  const trimmed = label.trim()
  for (const [name, key] of SORTED_STAT_NAMES) {
    if (trimmed === name) return key
  }
  // 少數字串會帶前後綴（例如「攻擊力 」或「全屬性 」後面接空白），退而求其次用包含比對
  for (const [name, key] of SORTED_STAT_NAMES) {
    if (trimmed.includes(name)) return key
  }
  return null
}

function unrecognized(raw: string): ParsedOption {
  return { raw, stat: 'misc', kind: 'flat', value: 0, per: 0, recognized: false }
}

/** 解析單一條潛能字串 */
export function parseOption(raw: string | null | undefined): ParsedOption | null {
  if (!raw) return null
  const text = raw.trim()
  if (!text) return null

  const perLevel = PER_LEVEL_RE.exec(text)
  if (perLevel) {
    const stat = matchStat(perLevel[2])
    if (!stat) return unrecognized(text)
    return {
      raw: text,
      stat,
      kind: 'perLevel',
      value: Number(perLevel[3]),
      per: Number(perLevel[1]),
      recognized: true,
    }
  }

  const percent = PERCENT_RE.exec(text)
  if (percent) {
    const stat = matchStat(percent[1])
    if (!stat) return unrecognized(text)
    return { raw: text, stat, kind: 'percent', value: Number(percent[2]), per: 0, recognized: true }
  }

  const flat = FLAT_RE.exec(text)
  if (flat) {
    const stat = matchStat(flat[1])
    if (!stat) return unrecognized(text)
    return { raw: text, stat, kind: 'flat', value: Number(flat[2]), per: 0, recognized: true }
  }

  // 「被擊中時有20% 機率無視39 傷害」這種條件觸發型，無法靜態換算
  return unrecognized(text)
}

/**
 * 把 perLevel 換算成實際固定值。
 * 遊戲的算法是無條件捨去：283 級、每 9 級 +1 → floor(283/9) = 31。
 */
export function resolveValue(option: ParsedOption, characterLevel: number): number {
  if (option.kind !== 'perLevel') return option.value
  if (!option.per) return 0
  return Math.floor(characterLevel / option.per) * option.value
}

export interface StatTotals {
  flat: Partial<Record<StatKey, number>>
  percent: Partial<Record<StatKey, number>>
  /** 無法解析的字串，UI 應該把這些顯示出來讓使用者知道有漏算 */
  unrecognized: string[]
}

export function emptyTotals(): StatTotals {
  return { flat: {}, percent: {}, unrecognized: [] }
}

/** 把一批潛能字串加總成固定值／百分比兩本帳 */
export function sumOptions(
  lines: ReadonlyArray<string | null | undefined>,
  characterLevel: number,
  into: StatTotals = emptyTotals(),
): StatTotals {
  for (const line of lines) {
    const parsed = parseOption(line)
    if (!parsed) continue
    if (!parsed.recognized) {
      into.unrecognized.push(parsed.raw)
      continue
    }

    const bucket = parsed.kind === 'percent' ? into.percent : into.flat
    const value = resolveValue(parsed, characterLevel)
    bucket[parsed.stat] = (bucket[parsed.stat] ?? 0) + value
  }
  return into
}
