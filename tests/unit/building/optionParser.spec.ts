import { describe, expect, it } from 'vitest'
import {
  parseOption,
  resolveValue,
  sumOptions,
  type ParsedOption,
} from '@/building/core/optionParser'

/** 測試角色：283 級主教，字串取自實際 API 回應 */
const LEVEL = 283

function parsed(raw: string): ParsedOption {
  const result = parseOption(raw)
  expect(result, `應該解析出結果：${raw}`).not.toBeNull()
  return result as ParsedOption
}

describe('parseOption — 固定值', () => {
  it('解析主屬性', () => {
    expect(parsed('INT +18')).toMatchObject({ stat: 'int', kind: 'flat', value: 18 })
    expect(parsed('DEX +11')).toMatchObject({ stat: 'dex', kind: 'flat', value: 11 })
    expect(parsed('LUK +9%')).toMatchObject({ stat: 'luk', kind: 'percent', value: 9 })
  })

  it('解析 HP／MP', () => {
    expect(parsed('MaxHP +125')).toMatchObject({ stat: 'maxHp', kind: 'flat', value: 125 })
    expect(parsed('MaxMP +60')).toMatchObject({ stat: 'maxMp', kind: 'flat', value: 60 })
  })

  it('全屬性同時有固定值與百分比兩種寫法', () => {
    expect(parsed('全屬性 +3')).toMatchObject({ stat: 'allStat', kind: 'flat', value: 3 })
    expect(parsed('全屬性 +10%')).toMatchObject({ stat: 'allStat', kind: 'percent', value: 10 })
  })
})

describe('parseOption — 百分比', () => {
  it('解析傷害類', () => {
    expect(parsed('攻擊Boss怪物時傷害 +40%')).toMatchObject({
      stat: 'bossDamage',
      kind: 'percent',
      value: 40,
    })
    expect(parsed('爆擊傷害 +8%')).toMatchObject({ stat: 'critDamage', value: 8 })
    expect(parsed('無視怪物防禦率 +30%')).toMatchObject({ stat: 'ignoreDefense', value: 30 })
  })

  it('小數點百分比', () => {
    expect(parsed('爆擊傷害 +2.5%')).toMatchObject({ stat: 'critDamage', value: 2.5 })
  })
})

describe('parseOption — 名稱比對的陷阱', () => {
  // 「魔法攻擊力」字串裡含有「攻擊力」，若比對順序錯誤會把魔攻算成物攻，
  // 對法師系職業就是災難性的誤差。
  it('魔法攻擊力不可誤判為攻擊力', () => {
    expect(parsed('魔法攻擊力 +13%')).toMatchObject({ stat: 'magicPower', value: 13 })
    expect(parsed('魔法攻擊力 +12')).toMatchObject({ stat: 'magicPower', kind: 'flat', value: 12 })
    expect(parsed('攻擊力 +12')).toMatchObject({ stat: 'attackPower', kind: 'flat', value: 12 })
  })

  it('一般怪物傷害不可誤判為 Boss 傷害', () => {
    expect(parsed('一般怪物攻擊時傷害 +10%')).toMatchObject({ stat: 'normalMobDamage' })
    expect(parsed('攻擊Boss怪物時傷害 +18%')).toMatchObject({ stat: 'bossDamage' })
  })
})

describe('parseOption — 依角色等級換算', () => {
  it('每 9 級 +1，283 級應得 31（無條件捨去）', () => {
    const option = parsed('以角色等級為準每9級 INT +1')
    expect(option).toMatchObject({ stat: 'int', kind: 'perLevel', value: 1, per: 9 })
    expect(resolveValue(option, LEVEL)).toBe(31)
  })

  it('每 9 級 +2，283 級應得 62', () => {
    expect(resolveValue(parsed('以角色等級為準每9級 INT +2'), LEVEL)).toBe(62)
  })

  it('剛好整除與差一級的邊界', () => {
    const option = parsed('以角色等級為準每9級 INT +1')
    expect(resolveValue(option, 270)).toBe(30)
    expect(resolveValue(option, 278)).toBe(30)
    expect(resolveValue(option, 279)).toBe(31)
  })
})

describe('parseOption — 無法靜態換算的字串', () => {
  it('條件觸發型標成 recognized: false，不會被安靜丟掉', () => {
    const option = parsed('被擊中時有20% 機率無視39 傷害')
    expect(option.recognized).toBe(false)
    expect(option.raw).toBe('被擊中時有20% 機率無視39 傷害')
  })

  it('空字串與 null 回傳 null', () => {
    expect(parseOption(null)).toBeNull()
    expect(parseOption('')).toBeNull()
    expect(parseOption('   ')).toBeNull()
  })
})

describe('sumOptions', () => {
  it('固定值與百分比分開記帳', () => {
    const totals = sumOptions(['INT +10%', 'INT +13%', 'INT +12', '魔法攻擊力 +12%'], LEVEL)
    expect(totals.percent.int).toBe(23)
    expect(totals.flat.int).toBe(12)
    expect(totals.percent.magicPower).toBe(12)
  })

  it('perLevel 會換算成固定值再累加', () => {
    const totals = sumOptions(['以角色等級為準每9級 INT +1', 'INT +18'], LEVEL)
    expect(totals.flat.int).toBe(31 + 18)
  })

  it('無法解析的字串會被列出來', () => {
    const totals = sumOptions(['INT +10%', '被擊中時有20% 機率無視39 傷害'], LEVEL)
    expect(totals.percent.int).toBe(10)
    expect(totals.unrecognized).toEqual(['被擊中時有20% 機率無視39 傷害'])
  })

  it('略過 null 與空值', () => {
    const totals = sumOptions(['INT +5%', null, undefined, ''], LEVEL)
    expect(totals.percent.int).toBe(5)
    expect(totals.unrecognized).toHaveLength(0)
  })
})

describe('實際角色的 57 條潛能字串', () => {
  // 取自 283 級主教「藜樂拌楓糖」的 29 件裝備，全部去重後的潛能與附加潛能。
  const REAL_LINES = [
    'DEX +11',
    'DEX +6%',
    'HP恢復道具及恢復技能效率 +30%',
    'INT +10',
    'INT +10%',
    'INT +12',
    'INT +12%',
    'INT +13%',
    'INT +18',
    'INT +2%',
    'INT +4%',
    'INT +5%',
    'INT +6%',
    'INT +7%',
    'INT +8%',
    'INT +9%',
    'LUK +5%',
    'LUK +9%',
    'MaxHP +12%',
    'MaxHP +125',
    'MaxHP +3%',
    'MaxHP +60',
    'MaxHP +7%',
    'MaxHP +8%',
    'MaxMP +60',
    '以角色等級為準每9級 INT +1',
    '以角色等級為準每9級 INT +2',
    '全屬性 +10%',
    '全屬性 +2%',
    '全屬性 +3',
    '全屬性 +3%',
    '全屬性 +5%',
    '全屬性 +6%',
    '全屬性 +7%',
    '全屬性 +9%',
    '攻擊Boss怪物時傷害 +18%',
    '攻擊Boss怪物時傷害 +30%',
    '攻擊Boss怪物時傷害 +40%',
    '楓幣獲得量 +20%',
    '無視怪物防禦率 +30%',
    '爆擊傷害 +8%',
    '移動速度 +6',
    '被擊中時有20% 機率無視39 傷害',
    '跳躍力 +5',
    '跳躍力 +6',
    '防禦力 +100',
    '魔法攻擊力 +10',
    '魔法攻擊力 +10%',
    '魔法攻擊力 +11',
    '魔法攻擊力 +12',
    '魔法攻擊力 +12%',
    '魔法攻擊力 +13%',
    '魔法攻擊力 +3%',
    '魔法攻擊力 +4%',
    '魔法攻擊力 +6%',
    '魔法攻擊力 +7%',
    '魔法攻擊力 +9%',
  ]

  it('只有條件觸發型那一條解析不出來', () => {
    const totals = sumOptions(REAL_LINES, LEVEL)
    expect(totals.unrecognized).toEqual(['被擊中時有20% 機率無視39 傷害'])
  })

  it('沒有任何一條魔法攻擊力被誤判成攻擊力', () => {
    const totals = sumOptions(REAL_LINES, LEVEL)
    expect(totals.flat.attackPower).toBeUndefined()
    expect(totals.percent.attackPower).toBeUndefined()
    expect(totals.percent.magicPower).toBe(10 + 12 + 13 + 3 + 4 + 6 + 7 + 9)
    expect(totals.flat.magicPower).toBe(10 + 11 + 12)
  })
})
