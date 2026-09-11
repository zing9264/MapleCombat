// 星力強化數值計算。
//
// 數值表對照自開源函式庫 Lechros/malib（KMS 規則），並用玩家實際裝備驗證過：
//   永恆法師褲 Lv.250 / 22星 / 主教 → INT 159、STR 119、魔攻 120、MaxHP 255
//   四項與 API 的 item_starforce_option 完全一致，確認 TMS 沿用同一套表。
//
// 計算是逐星累加的，不能用「查最終值」的方式帶過 —— 防禦力每星的增加量取決於
// 當下已累積的防禦力（floor(armor/20)+1），15 星以下的武器攻擊力也是同樣的
// 遞迴結構。

export type JobCategory = 'beginner' | 'warrior' | 'magician' | 'bowman' | 'thief' | 'pirate'

/** 影響星力計算方式的裝備分類 */
export type GearKind =
  | 'weapon'
  | 'shield'
  | 'glove'
  | 'shoes'
  | 'machineHeart'
  | 'armor'
  | 'accessory'

export interface NumericOption {
  str?: number
  dex?: number
  int?: number
  luk?: number
  attackPower?: number
  magicPower?: number
  armor?: number
  maxHp?: number
  maxMp?: number
  speed?: number
  jump?: number
  /** 以下為百分比類欄位，星力不會產生，但換裝比較需要在同一型別裡承載 */
  bossDamage?: number
  ignoreDefense?: number
  allStat?: number
  damage?: number
}

export interface StarforceInput {
  /** 裝備需求等級 */
  reqLevel: number
  /** 目標星數 */
  star: number
  kind: GearKind
  job: JobCategory
  /** 白：基底數值 */
  base: NumericOption
  /** 紫：卷軸數值 */
  upgrade?: NumericOption
  /** 部位是否吃 MaxHP 加成（帽子/上衣/褲裙/披風/戒指/墜飾/腰帶/肩膀/盾牌） */
  gainsMaxHp?: boolean
}

const STAT_TYPES = ['str', 'dex', 'int', 'luk'] as const
type StatType = (typeof STAT_TYPES)[number]

/** 各職業「主副屬性」— 這兩項從 1 星就開始加，其餘屬性 16 星後才加 */
const JOB_STATS: Record<JobCategory, readonly StatType[]> = {
  beginner: STAT_TYPES,
  warrior: ['str', 'dex'],
  magician: ['int', 'luk'],
  bowman: ['dex', 'str'],
  thief: ['luk', 'dex'],
  pirate: ['str', 'dex'],
}

// 每列為 [最低等級, 1星, 2星, ..., 30星]
// prettier-ignore
const STARFORCE_STAT: readonly (readonly number[])[] = [
  [0, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0],
  [108, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0],
  [118, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 5, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  [128, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 7, 7, 7, 7, 7, 7, 7, 0, 0, 0, 0, 0, 0, 0, 0],
  [138, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 9, 9, 9, 9, 9, 9, 9, 0, 0, 0, 0, 0, 0, 0, 0],
  [148, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 11, 11, 11, 11, 11, 11, 11, 0, 0, 0, 0, 0, 0, 0, 0],
  [158, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 13, 13, 13, 13, 13, 13, 13, 0, 0, 0, 0, 0, 0, 0, 0],
  [198, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 15, 15, 15, 15, 15, 15, 15, 0, 0, 0, 0, 0, 0, 0, 0],
  [248, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 17, 17, 17, 17, 17, 17, 17, 0, 0, 0, 0, 0, 0, 0, 0],
]

// prettier-ignore
const STARFORCE_POWER: readonly (readonly number[])[] = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 5, 6, 7, 8, 0, 0, 0, 0, 0],
  [108, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 6, 7, 8, 9, 10, 12, 13, 15, 17, 18, 19, 20, 21, 22],
  [118, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 7, 8, 9, 10, 11, 13, 14, 16, 18, 19, 20, 21, 22, 23],
  [128, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 21, 22, 23, 24, 25],
  [138, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 9, 10, 11, 12, 13, 15, 17, 19, 21, 22, 23, 24, 25, 26],
  [148, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 23, 24, 25, 26, 27],
  [158, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 11, 12, 13, 14, 15, 17, 19, 21, 23, 24, 25, 26, 27, 28],
  [198, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 12, 13, 14, 15, 16, 17, 19, 21, 23, 25, 26, 27, 28, 29, 30],
  [248, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 14, 15, 16, 17, 18, 19, 21, 23, 25, 27, 28, 29, 30, 31, 32],
]

// prettier-ignore
const STARFORCE_WEAPON_POWER: readonly (readonly number[])[] = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 4, 5, 6, 7, 0, 0, 0, 0, 0],
  [108, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 5, 5, 6, 7, 8, 9, 27, 28, 29],
  [118, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 6, 6, 7, 8, 9, 10, 28, 29, 30],
  [128, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 7, 7, 8, 9, 10, 11, 29, 30, 31],
  [138, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7, 8, 8, 9, 10, 11, 12, 30, 31, 32, 33, 34, 35, 36, 37],
  [148, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 9, 9, 10, 11, 12, 13, 31, 32, 33, 34, 35, 36, 37, 38],
  [158, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 9, 10, 11, 12, 13, 14, 32, 33, 34, 35, 36, 37, 38, 39],
  [198, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 13, 13, 14, 14, 15, 16, 17, 34, 35, 36, 37, 38, 39, 40, 41],
  [248, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 15, 15, 16, 16, 17, 18, 19, 36, 37, 38, 39, 40, 41, 42, 43],
]

/** 索引為星數；手套 130 等以上額外加成 */
// prettier-ignore
const GLOVE_BONUS_POWER = [
  -1, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
]

// prettier-ignore
const MAX_HP_MP = [
  -1, 5, 5, 5, 10, 10, 15, 15, 20, 20, 25, 25, 25, 25, 25, 25,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
]

// prettier-ignore
const SPEED_JUMP = [
  -1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
]

/** 依需求等級找到適用的那一列，回傳該星數的值 */
function lookup(table: readonly (readonly number[])[], reqLevel: number, star: number): number {
  for (let i = table.length - 1; i >= 0; i--) {
    if (reqLevel >= table[i][0]) return table[i][star] ?? 0
  }
  return 0
}

/** 裝備最大可強化星數（依需求等級） */
export function maxStarFor(reqLevel: number): number {
  if (reqLevel >= 140) return 30
  if (reqLevel >= 130) return 20
  if (reqLevel >= 120) return 15
  if (reqLevel >= 110) return 10
  if (reqLevel >= 95) return 8
  return 5
}

const add = (target: NumericOption, key: keyof NumericOption, value: number): void => {
  if (value) target[key] = (target[key] ?? 0) + value
}

const valueOf = (option: NumericOption | undefined, key: keyof NumericOption): number =>
  Number(option?.[key] ?? 0)

/**
 * 計算星力強化提供的數值總和（對應 API 的 item_starforce_option）。
 *
 * 逐星累加，因為防禦力與 15 星以下的武器攻擊力都取決於當下已累積的數值。
 */
export function computeStarforce(input: StarforceInput): NumericOption {
  const { reqLevel, kind, job, base, upgrade } = input
  const star = Math.max(0, Math.min(input.star, maxStarFor(reqLevel)))
  const result: NumericOption = {}
  if (star <= 0) return result

  const jobStats = new Set<StatType>(JOB_STATS[job])
  const isWeapon = kind === 'weapon'
  const isMagician = job === 'magician'

  for (let s = 1; s <= star; s++) {
    const stat = lookup(STARFORCE_STAT, reqLevel, s)
    const power = lookup(isWeapon ? STARFORCE_WEAPON_POWER : STARFORCE_POWER, reqLevel, s)

    // 主副屬性從 1 星就加；其餘屬性 16 星起才加，且該欄位原本要有數值
    for (const type of STAT_TYPES) {
      if (jobStats.has(type)) {
        add(result, type, stat)
      } else if (s > 15 && (valueOf(base, type) > 0 || valueOf(upgrade, type) > 0)) {
        add(result, type, stat)
      }
    }

    if (isWeapon) {
      if (s > 15) {
        add(result, 'attackPower', power)
        if (isMagician) add(result, 'magicPower', power)
      } else {
        // 15 星以下依當下累積攻擊力遞增
        const attack =
          valueOf(base, 'attackPower') +
          valueOf(upgrade, 'attackPower') +
          valueOf(result, 'attackPower')
        add(result, 'attackPower', Math.floor(attack / 50) + 1)
        if (isMagician) {
          const magic =
            valueOf(base, 'magicPower') +
            valueOf(upgrade, 'magicPower') +
            valueOf(result, 'magicPower')
          add(result, 'magicPower', Math.floor(magic / 50) + 1)
        }
      }
      const hp = MAX_HP_MP[s] ?? 0
      add(result, 'maxHp', hp)
      add(result, 'maxMp', hp)
    } else {
      add(result, 'attackPower', power)
      add(result, 'magicPower', power)

      if (kind === 'glove' && reqLevel >= 130) {
        const bonus = GLOVE_BONUS_POWER[s] ?? 0
        if (job === 'beginner') {
          add(result, 'attackPower', bonus)
          add(result, 'magicPower', bonus)
        } else if (isMagician) {
          add(result, 'magicPower', bonus)
        } else {
          add(result, 'attackPower', bonus)
        }
      }

      // 只有機器心臟不吃防禦力加成（實測盾牌有）
      if (kind !== 'machineHeart') {
        const armor = valueOf(base, 'armor') + valueOf(upgrade, 'armor') + valueOf(result, 'armor')
        add(result, 'armor', Math.floor(armor / 20) + 1)
      }

      if (input.gainsMaxHp) add(result, 'maxHp', MAX_HP_MP[s] ?? 0)

      if (kind === 'shoes') {
        const speedJump = SPEED_JUMP[s] ?? 0
        add(result, 'speed', speedJump)
        add(result, 'jump', speedJump)
      }
    }
  }

  return result
}

/**
 * 推論裝備本身的職業需求。
 *
 * 星力的主副屬性看的是**裝備的職業需求**而非角色職業：飾品與機器心臟是「共用」裝，
 * 四項屬性從 1 星就全加；防具與武器是職業專用，只加該職業的主副屬性。
 * API 沒有回傳裝備職業，改以部位判斷 —— 實測 19 件有星力的裝備全部命中。
 */
export function inferItemJob(part: string, characterJob: JobCategory): JobCategory {
  return SHARED_PARTS.has(part) ? 'beginner' : characterJob
}

/** 「共用」裝備的部位 */
const SHARED_PARTS: ReadonlySet<string> = new Set([
  '臉飾',
  '眼飾',
  '耳環',
  '戒指',
  '墜飾',
  '腰帶',
  '口袋道具',
  '機器心臟',
  '胸章',
  '徽章',
  '勳章',
  '圖騰',
  '寶石',
  '輔助特殊技能戒指',
])

/** 吃 MaxHP 星力加成的部位 */
const MAX_HP_PARTS: ReadonlySet<string> = new Set([
  '帽子',
  '上衣',
  '套服',
  '褲/裙',
  '披風',
  '戒指',
  '墜飾',
  '腰帶',
  '肩膀裝飾',
  '盾牌',
])

const KIND_BY_PART: Record<string, GearKind> = {
  手套: 'glove',
  鞋子: 'shoes',
  機器心臟: 'machineHeart',
  盾牌: 'shield',
}

/** 由部位名稱推出星力計算所需的分類；weaponParts 用來判斷武器 */
export function gearKindOf(part: string, isWeaponPart: boolean): GearKind {
  if (isWeaponPart) return 'weapon'
  return KIND_BY_PART[part] ?? (MAX_HP_PARTS.has(part) ? 'armor' : 'accessory')
}

export function partGainsMaxHp(part: string): boolean {
  return MAX_HP_PARTS.has(part)
}

/**
 * 由角色主屬性推出星力用的職業分類。
 *
 * 戰士與海盜的主副屬性都是 STR/DEX，星力計算上完全等價，因此不需區分。
 * 惡魔復仇者主屬為 HP，副屬 STR，比照戰士處理。
 */
export function jobCategoryFromMainStat(mainStat: string): JobCategory {
  switch (mainStat) {
    case 'INT':
      return 'magician'
    case 'DEX':
      return 'bowman'
    case 'LUK':
      return 'thief'
    default:
      return 'warrior'
  }
}
