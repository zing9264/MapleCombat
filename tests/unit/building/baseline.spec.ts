// 基準推導。fixture 直接用藜樂拌楓糖那份真實快照的資料，
// 這樣測的是實際會遇到的格式，而不是我想像中的格式。
import { describe, expect, it } from 'vitest'
import { floorPercentApplied } from '@/core/percentFloor'
import type { HyperStatEntry, StatEntry, SymbolItem } from '@/building/services/nexonApi'
import {
  apBaseline,
  combineBaselines,
  firstNumber,
  hyperBaseline,
  petBaseline,
  rebuildPanelValue,
  symbolBaseline,
} from '@/building/core/baseline'

const AP: StatEntry[] = [
  { stat_name: 'AP配點STR', stat_value: '4' },
  { stat_name: 'AP配點DEX', stat_value: '4' },
  { stat_name: 'AP配點INT', stat_value: '1433' },
  { stat_name: 'AP配點LUK', stat_value: '4' },
  { stat_name: 'AP配點HP', stat_value: '0' },
  { stat_name: 'INT', stat_value: '55498' },
]

/** 祕法符文三顆，每顆 INT 2200；真實資料裡 symbol_force 與戰鬥力無關 */
const SYMBOLS = [
  { symbol_str: '0', symbol_dex: '0', symbol_int: '2200', symbol_luk: '0', symbol_force: '220' },
  { symbol_str: '0', symbol_dex: '0', symbol_int: '2200', symbol_luk: '0', symbol_force: '220' },
  { symbol_str: '0', symbol_dex: '0', symbol_int: '2200', symbol_luk: '0', symbol_force: '220' },
] as unknown as SymbolItem[]

/** 這七條就是該角色實際的極限屬性，語序與空白都照抄 */
const HYPER: HyperStatEntry[] = [
  { stat_type: 'INT', stat_level: 10, stat_point: 150, stat_increase: '增加智力 300' },
  { stat_type: '爆擊傷害', stat_level: 10, stat_point: 150, stat_increase: '爆擊傷害10%增加' },
  { stat_type: '無視防禦率', stat_level: 5, stat_point: 25, stat_increase: '無視防禦率增加 15%' },
  { stat_type: '傷害', stat_level: 11, stat_point: 200, stat_increase: '提高傷害 33% ' },
  {
    stat_type: '攻擊力／魔力',
    stat_level: 5,
    stat_point: 25,
    stat_increase: '增加攻擊力與魔力15',
  },
  {
    stat_type: '獲得經驗值',
    stat_level: 15,
    stat_point: 550,
    stat_increase: '獲得經驗值提高10.0%',
  },
  {
    stat_type: '一般傷害',
    stat_level: 11,
    stat_point: 200,
    stat_increase: '攻擊一般怪物時傷害增加39%',
  },
]

describe('firstNumber', () => {
  it('抓得到各種語序裡的數字', () => {
    expect(firstNumber('增加智力 300')).toBe(300)
    expect(firstNumber('爆擊傷害10%增加')).toBe(10)
    expect(firstNumber('增加攻擊力與魔力15')).toBe(15)
    expect(firstNumber('提高傷害 33% ')).toBe(33)
  })

  it('支援小數', () => {
    expect(firstNumber('獲得經驗值提高10.0%')).toBe(10)
  })

  it('沒有數字時回傳 0', () => {
    expect(firstNumber('')).toBe(0)
    expect(firstNumber('沒有數字')).toBe(0)
  })
})

describe('apBaseline', () => {
  it('AP 配點進基本數值（會吃 ％ 加成）', () => {
    const source = apBaseline(AP)
    expect(source.flat).toEqual({ str: 4, dex: 4, int: 1433, luk: 4 })
    expect(source.noApply).toEqual({})
  })

  it('不會把面板上的 INT 誤當成 AP 配點', () => {
    // AP 只認 'AP配點INT'，不能抓到 'INT' 那一條
    expect(apBaseline(AP).flat.int).toBe(1433)
  })
})

describe('symbolBaseline', () => {
  it('符文進「％未套用」，不是基本數值', () => {
    // 道具說明寫明「不會有能力%增加的效果」。
    // 放錯會被將近 700% 的加成乘上去，基準整個報廢。
    const source = symbolBaseline(SYMBOLS)
    expect(source.noApply).toEqual({ int: 6600 })
    expect(source.flat).toEqual({})
  })

  it('力量不計入戰鬥力', () => {
    const source = symbolBaseline(SYMBOLS)
    expect(Object.keys(source.noApply)).toEqual(['int'])
  })
})

describe('hyperBaseline', () => {
  const source = hyperBaseline(HYPER)

  it('主屬進「％未套用」、攻擊力進基本數值', () => {
    // 遊戲明細：INT 的極限屬性列在［％未套用數值］，魔攻的列在［基本數值］
    expect(source.noApply.int).toBe(300)
    expect(source.flat.int).toBeUndefined()
    // 「攻擊力／魔力」一條同時給兩種
    expect(source.flat.attackPower).toBe(15)
    expect(source.flat.magicPower).toBe(15)
  })

  it('傷害類進百分比', () => {
    expect(source.percent.critDamage).toBe(10)
    expect(source.percent.damage).toBe(33)
    expect(source.percent.normalMobDamage).toBe(39)
    expect(source.percent.ignoreDefense).toBe(15)
  })

  it('與戰鬥力無關的項目略過，且不算「看不懂」', () => {
    expect(source.unrecognized).toEqual([])
  })

  it('沒點的極限屬性不計入', () => {
    const none = hyperBaseline([
      { stat_type: 'INT', stat_level: 0, stat_point: 0, stat_increase: null },
    ])
    expect(none.flat).toEqual({})
  })

  it('大小寫不同也要認得', () => {
    // 實測 API 給的是 `Boss傷害`，不是 `BOSS傷害`；
    // 這個差異曾讓整條 43% 的 BOSS 傷害被當成看不懂而漏算
    const real = hyperBaseline([
      {
        stat_type: 'Boss傷害',
        stat_level: 10,
        stat_point: 150,
        stat_increase: '攻擊Boss怪物時，傷害增加 43%',
      },
    ])
    expect(real.percent.bossDamage).toBe(43)
    expect(real.unrecognized).toEqual([])

    const upper = hyperBaseline([
      { stat_type: 'BOSS傷害', stat_level: 10, stat_point: 150, stat_increase: '傷害增加 43%' },
    ])
    expect(upper.percent.bossDamage).toBe(43)
  })

  it('神祕力量與戰鬥力無關，略過且不算看不懂', () => {
    const arcane = hyperBaseline([
      { stat_type: '神祕力量', stat_level: 5, stat_point: 25, stat_increase: '增加20神祕力量' },
    ])
    expect(arcane.unrecognized).toEqual([])
    expect(arcane.flat).toEqual({})
  })

  it('沒收錄的類型要回報，不能靜默丟掉', () => {
    // 少算一項就是基準錯，而基準錯會污染之後每一次戰鬥力計算
    const unknown = hyperBaseline([
      { stat_type: '某個新屬性', stat_level: 5, stat_point: 25, stat_increase: '增加某數值 10' },
    ])
    expect(unknown.unrecognized).toEqual(['某個新屬性：增加某數值 10'])
  })

  it('讀不到數值也要回報', () => {
    const broken = hyperBaseline([
      { stat_type: 'INT', stat_level: 5, stat_point: 25, stat_increase: '增加智力' },
    ])
    expect(broken.unrecognized).toEqual(['INT：讀不到數值'])
  })
})

describe('petBaseline', () => {
  /** 三隻寵物的真實資料：各 攻擊力 10，魔攻 115／100／100 */
  const PETS = [
    {
      name: '交響曲',
      itemName: '月光水晶鑰匙',
      options: [
        { type: '攻擊力', value: '10' },
        { type: '魔法攻擊力', value: '115' },
      ],
    },
    {
      name: '協奏曲',
      itemName: '月光水晶鑰匙',
      options: [
        { type: '攻擊力', value: '10' },
        { type: '魔法攻擊力', value: '100' },
      ],
    },
    {
      name: '迷你時間',
      itemName: '月光水晶鑰匙',
      options: [
        { type: '攻擊力', value: '10' },
        { type: '魔法攻擊力', value: '100' },
      ],
    },
  ]

  it('三隻寵物合計魔攻 315、攻擊力 30', () => {
    const source = petBaseline(PETS)
    expect(source.flat.magicPower).toBe(315)
    expect(source.flat.attackPower).toBe(30)
  })

  it('算吃 ％ 的固定值，不進 noApply', () => {
    // 依據上游公式：adjPetAtk 併進 attackBase 之後才乘 attackPercent
    expect(petBaseline(PETS).noApply).toEqual({})
  })

  it('沒有寵物時是空的，不會炸', () => {
    expect(petBaseline([]).flat).toEqual({})
  })

  it('沒收錄的詞條要回報', () => {
    const odd = petBaseline([
      { name: '怪寵', itemName: '', options: [{ type: '某個新詞條', value: '5' }] },
    ])
    expect(odd.unrecognized).toEqual(['怪寵：某個新詞條 5'])
    expect(odd.flat).toEqual({})
  })
})

describe('combineBaselines', () => {
  it('三個來源加總，flat 與 noApply 各歸各的', () => {
    const combined = combineBaselines([
      apBaseline(AP),
      symbolBaseline(SYMBOLS),
      hyperBaseline(HYPER),
    ])

    // AP 配點只有 1433；極限屬性的主屬不在這裡（它進 noApply）
    expect(combined.flat.int).toBe(1433)
    // 符文 2200×3 ＋ 極限屬性 300，都不吃 ％
    expect(combined.noApply.int).toBe(6900)
    expect(combined.percent.damage).toBe(33)
    expect(combined.unrecognized).toEqual([])
    expect(combined.sources.map((s) => s.label)).toEqual(['AP配點', '符文', '極限屬性'])
  })

  it('空來源不會炸', () => {
    const combined = combineBaselines([])
    expect(combined.flat).toEqual({})
    expect(combined.sources).toEqual([])
  })
})

describe('rebuildPanelValue', () => {
  it('取整方式與上游公式一致', () => {
    // 與 floorPercentApplied 綁在一起，避免日後上游改了取整而我們沒跟上
    expect(rebuildPanelValue(1000, 33, 0)).toBe(floorPercentApplied(1000, 33))
    expect(rebuildPanelValue(1733, 628, 0)).toBe(floorPercentApplied(1733, 628))
  })

  it('％未套用是最後才加，不吃百分比', () => {
    // 基底 1000 + 100%，再加上不吃加成的 500 → 2000 + 500
    expect(rebuildPanelValue(1000, 100, 500)).toBe(2500)
  })

  it('沒有百分比時就是相加', () => {
    expect(rebuildPanelValue(1433, 0, 6600)).toBe(8033)
  })
})
