// 把各種來源的裝備轉成換裝比較引擎的統一格式。
//
// 同一件裝備的四層數值命名不一致：基底與卷軸沿用 API 的底線命名（magic_power），
// 星力與星火是計算模組產出的駝峰命名（magicPower）。直接用欄位名稱去讀就會漏 ——
// 實際發生過：物品欄的魔攻只顯示基底 6，漏了星力的 120。所以一律經過這裡轉換。

import type { EquipmentItem } from '../services/nexonApi'
import type { GearForCompare } from './equipmentDelta'
import type { NumericOption } from './starforce'

const TO_CAMEL: Record<string, keyof NumericOption> = {
  str: 'str',
  dex: 'dex',
  int: 'int',
  luk: 'luk',
  max_hp: 'maxHp',
  maxHp: 'maxHp',
  max_mp: 'maxMp',
  maxMp: 'maxMp',
  attack_power: 'attackPower',
  attackPower: 'attackPower',
  magic_power: 'magicPower',
  magicPower: 'magicPower',
  armor: 'armor',
  boss_damage: 'bossDamage',
  bossDamage: 'bossDamage',
  ignore_monster_armor: 'ignoreDefense',
  ignoreDefense: 'ignoreDefense',
  all_stat: 'allStat',
  allStat: 'allStat',
  damage: 'damage',
}

/** 任一種命名的數值層 → 駝峰命名的 NumericOption，略過 0 與無關欄位 */
export function normalizeLayer(layer: object | null | undefined): NumericOption {
  const result: NumericOption = {}
  for (const [key, value] of Object.entries((layer ?? {}) as Record<string, unknown>)) {
    const camel = TO_CAMEL[key]
    const num = Number(value ?? 0)
    if (!camel || !num) continue
    result[camel] = (result[camel] ?? 0) + num
  }
  return result
}

const hasValue = (layer: NumericOption) => Object.keys(layer).length > 0

/**
 * API 抓下來的裝備 → 比較格式。
 *
 * 寶石的數值只存在 item_total_option，四個分層全是 0（實測伊妮絲的寶玉 INT 1750）。
 * 分層全空時改用 total 當基底，否則整件的數值會在比較時憑空消失。
 */
export function fromApiItem(item: EquipmentItem): GearForCompare {
  const base = normalizeLayer(item.item_base_option)
  const starforce = normalizeLayer(item.item_starforce_option)
  const etc = normalizeLayer(item.item_etc_option)
  const add = normalizeLayer(item.item_add_option)
  const layered = [base, starforce, etc, add].some(hasValue)

  return {
    name: item.item_name,
    part: item.item_equipment_part,
    base: layered ? base : normalizeLayer(item.item_total_option),
    starforce,
    etc,
    add,
    potentials: [item.potential_option_1, item.potential_option_2, item.potential_option_3].filter(
      (line): line is string => Boolean(line),
    ),
    additionalPotentials: [
      item.additional_potential_option_1,
      item.additional_potential_option_2,
      item.additional_potential_option_3,
    ].filter((line): line is string => Boolean(line)),
  }
}
