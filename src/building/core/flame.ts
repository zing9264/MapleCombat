// 星火（追加選項）數值計算。
//
// 公式對照自 Lechros/malib（KMS 規則），並用玩家實際裝備驗證：
//
//   永恆法師褲 Lv.250 星火 STR21 / DEX26 / INT71 / LUK0
//   → INT 單屬3階(36) + INT&STR 雙屬3階(21) + INT&DEX 雙屬2階(14) + DEX 單屬1階(12)
//     STR = 21、DEX = 14+12 = 26、INT = 36+21+14 = 71、LUK = 0  ✅ 四條剛好是上限
//
//   創世長杖 Lv.200 星火魔攻 74
//   → BOSS 掉落武器 3 階：ceil(406 × 1 × 6 × 3 / 100) = 74  ✅
//
// 一件裝備最多四條星火，每條各自獨立擲出種類與階級（1~7）。

import type { NumericOption } from './starforce'

/** 星火種類。雙屬性種類會同時加兩個屬性。 */
export type FlameType =
  | 'str'
  | 'dex'
  | 'int'
  | 'luk'
  | 'str_dex'
  | 'str_int'
  | 'str_luk'
  | 'dex_int'
  | 'dex_luk'
  | 'int_luk'
  | 'attackPower'
  | 'magicPower'
  | 'armor'
  | 'maxHp'
  | 'maxMp'
  | 'speed'
  | 'jump'
  | 'damage'
  | 'bossDamage'
  | 'allStat'
  | 'reqLevelDecrease'

/** 星火階級，1~7 */
export type FlameGrade = 1 | 2 | 3 | 4 | 5 | 6 | 7

export const MAX_FLAME_LINES = 4
export const MAX_FLAME_GRADE = 7

export interface FlameContext {
  reqLevel: number
  isWeapon: boolean
  /** BOSS 掉落裝備：武器的攻擊力星火改用另一組係數，數值高很多 */
  bossReward?: boolean
  /** 武器基底攻擊力／魔力，計算武器攻擊力星火時要用 */
  baseAttackPower?: number
  baseMagicPower?: number
}

export interface FlameLine {
  type: FlameType
  grade: FlameGrade
}

/** 武器攻擊力星火的階級係數 */
const WEAPON_POWER_FACTOR = [1, 2.222, 3.63, 5.325, 7.32, 8.777, 10.25] as const
const BOSS_WEAPON_POWER_FACTOR = [0, 0, 1, 1.4666, 2.0166, 2.663, 3.4166] as const

const DOUBLE_STAT_KEYS: Partial<Record<FlameType, readonly (keyof NumericOption)[]>> = {
  str_dex: ['str', 'dex'],
  str_int: ['str', 'int'],
  str_luk: ['str', 'luk'],
  dex_int: ['dex', 'int'],
  dex_luk: ['dex', 'luk'],
  int_luk: ['int', 'luk'],
}

/**
 * 單屬性係數。
 * 250 等以上不 +1 —— 這是個容易漏掉的特例，直接影響所有 250 等裝備。
 */
function singleStatCoefficient(reqLevel: number): number {
  return reqLevel >= 250 ? Math.floor(reqLevel / 20) : Math.floor(reqLevel / 20) + 1
}

function doubleStatCoefficient(reqLevel: number): number {
  return Math.floor(reqLevel / 40) + 1
}

function weaponPowerValue(grade: FlameGrade, ctx: FlameContext, type: FlameType): number {
  const attack = ctx.baseAttackPower ?? 0
  const magic = ctx.baseMagicPower ?? 0
  // 魔力星火在魔力高於攻擊力時以魔力為基準
  const power = type === 'magicPower' && magic > attack ? magic : attack

  if (ctx.bossReward) {
    const factor = BOSS_WEAPON_POWER_FACTOR[grade - 1]
    const scale = ctx.reqLevel > 160 ? 6 : ctx.reqLevel > 150 ? 5 : ctx.reqLevel > 110 ? 4 : 3
    return Math.ceil((power * factor * scale * 3) / 100)
  }
  const factor = WEAPON_POWER_FACTOR[grade - 1]
  const scale = ctx.reqLevel > 110 ? 4 : 3
  return Math.ceil((power * factor * scale) / 100)
}

/** 單一條星火的數值 */
export function flameValue(type: FlameType, grade: FlameGrade, ctx: FlameContext): number {
  switch (type) {
    case 'str':
    case 'dex':
    case 'int':
    case 'luk':
    case 'armor':
      return singleStatCoefficient(ctx.reqLevel) * grade
    case 'str_dex':
    case 'str_int':
    case 'str_luk':
    case 'dex_int':
    case 'dex_luk':
    case 'int_luk':
      return doubleStatCoefficient(ctx.reqLevel) * grade
    case 'attackPower':
    case 'magicPower':
      return ctx.isWeapon ? weaponPowerValue(grade, ctx, type) : grade
    case 'maxHp':
    case 'maxMp':
      if (ctx.reqLevel < 10) return 3 * grade
      if (ctx.reqLevel >= 250) return 700 * grade
      return Math.floor(ctx.reqLevel / 10) * 30 * grade
    case 'speed':
    case 'jump':
    case 'damage':
    case 'allStat':
      return grade
    case 'bossDamage':
      return 2 * grade
    case 'reqLevelDecrease':
      return Math.min(ctx.reqLevel, 5 * grade)
  }
}

/** 這件裝備能不能出這種星火 */
export function supportsFlameType(type: FlameType, ctx: FlameContext): boolean {
  switch (type) {
    case 'attackPower':
    case 'magicPower':
      return ctx.isWeapon || ctx.reqLevel >= 60
    case 'speed':
    case 'jump':
      return !ctx.isWeapon
    case 'damage':
      return ctx.isWeapon
    case 'bossDamage':
      return ctx.isWeapon && ctx.reqLevel >= 90
    case 'allStat':
      return ctx.isWeapon || ctx.reqLevel >= 70
    default:
      return true
  }
}

/** 把一條星火展開成能力值（雙屬性會同時加兩項） */
export function flameOption(line: FlameLine, ctx: FlameContext): NumericOption {
  const value = flameValue(line.type, line.grade, ctx)
  const doubleKeys = DOUBLE_STAT_KEYS[line.type]
  if (doubleKeys) {
    return Object.fromEntries(doubleKeys.map((key) => [key, value]))
  }
  if (line.type === 'reqLevelDecrease') return {}
  return { [line.type as keyof NumericOption]: value }
}

/** 多條星火加總（上限四條，超過的會被忽略） */
export function sumFlames(lines: readonly FlameLine[], ctx: FlameContext): NumericOption {
  const total: NumericOption = {}
  for (const line of lines.slice(0, MAX_FLAME_LINES)) {
    for (const [key, value] of Object.entries(flameOption(line, ctx))) {
      const k = key as keyof NumericOption
      total[k] = (total[k] ?? 0) + Number(value ?? 0)
    }
  }
  return total
}

/** UI 用的種類清單與顯示名稱 */
export const FLAME_TYPE_LABELS: ReadonlyArray<[FlameType, string]> = [
  ['str', 'STR'],
  ['dex', 'DEX'],
  ['int', 'INT'],
  ['luk', 'LUK'],
  ['str_dex', 'STR + DEX'],
  ['str_int', 'STR + INT'],
  ['str_luk', 'STR + LUK'],
  ['dex_int', 'DEX + INT'],
  ['dex_luk', 'DEX + LUK'],
  ['int_luk', 'INT + LUK'],
  ['attackPower', '攻擊力'],
  ['magicPower', '魔法攻擊力'],
  ['allStat', '全屬性 %'],
  ['bossDamage', 'BOSS 傷害 %'],
  ['damage', '傷害 %'],
  ['maxHp', 'MaxHP'],
  ['maxMp', 'MaxMP'],
  ['armor', '防禦力'],
  ['speed', '移動速度'],
  ['jump', '跳躍力'],
  ['reqLevelDecrease', '需求等級降低'],
]
