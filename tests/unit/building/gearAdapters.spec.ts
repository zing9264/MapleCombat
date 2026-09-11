import { describe, expect, it } from 'vitest'
import { fromApiItem, normalizeLayer } from '@/building/core/gearAdapters'
import type { EquipmentItem } from '@/building/services/nexonApi'

const ZERO = { str: '0', dex: '0', int: '0', luk: '0', magic_power: '0' }

function apiItem(partial: Partial<EquipmentItem>): EquipmentItem {
  return {
    item_name: '測試裝備',
    item_equipment_part: '戒指',
    item_base_option: ZERO,
    item_total_option: ZERO,
    item_starforce_option: ZERO,
    item_etc_option: ZERO,
    item_add_option: ZERO,
    potential_option_1: null,
    potential_option_2: null,
    potential_option_3: null,
    additional_potential_option_1: null,
    additional_potential_option_2: null,
    additional_potential_option_3: null,
    ...partial,
  } as unknown as EquipmentItem
}

describe('normalizeLayer', () => {
  it('底線與駝峰兩種命名都轉成駝峰', () => {
    // 基底層是 API 的底線命名、星力層是計算模組的駝峰命名，兩者曾經混用導致漏算
    expect(normalizeLayer({ magic_power: '6' })).toEqual({ magicPower: 6 })
    expect(normalizeLayer({ magicPower: 120 })).toEqual({ magicPower: 120 })
  })

  it('略過 0 與無關欄位', () => {
    expect(normalizeLayer({ int: '0', base_equipment_level: 250, luk: '50' })).toEqual({ luk: 50 })
  })

  it('空值回傳空物件', () => {
    expect(normalizeLayer(undefined)).toEqual({})
    expect(normalizeLayer(null)).toEqual({})
  })
})

describe('fromApiItem', () => {
  it('一般裝備採用四個分層', () => {
    const gear = fromApiItem(
      apiItem({
        item_base_option: { int: '50', magic_power: '6' },
        item_starforce_option: { int: '159', magic_power: '120' },
        item_etc_option: { magic_power: '91' },
        item_add_option: { int: '71' },
      }),
    )
    expect(gear.base).toEqual({ int: 50, magicPower: 6 })
    expect(gear.starforce).toEqual({ int: 159, magicPower: 120 })
    expect(gear.etc).toEqual({ magicPower: 91 })
    expect(gear.add).toEqual({ int: 71 })
  })

  it('寶石四個分層全空時改用 total，不會整件消失', () => {
    // 實測伊妮絲的寶玉：INT 1750 只存在 item_total_option
    const gem = fromApiItem(
      apiItem({
        item_name: '伊妮絲的寶玉',
        item_equipment_part: '寶石',
        item_total_option: { int: '1750' },
      }),
    )
    expect(gem.base).toEqual({ int: 1750 })
  })

  it('潛能與附加潛能只保留有內容的行', () => {
    const gear = fromApiItem(
      apiItem({
        potential_option_1: 'INT +13%',
        potential_option_2: null,
        potential_option_3: 'INT +10%',
        additional_potential_option_1: '魔法攻擊力 +12',
      }),
    )
    expect(gear.potentials).toEqual(['INT +13%', 'INT +10%'])
    expect(gear.additionalPotentials).toEqual(['魔法攻擊力 +12'])
  })
})
