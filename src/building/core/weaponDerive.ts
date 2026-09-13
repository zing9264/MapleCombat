// 從同步下來的裝備推導上游武器校正需要的四個輸入。
//
// 為什麼要校正：遊戲算戰鬥力時**不是**用你武器面板上的攻擊力，而是用
// 「同系列標準武器 + 卷軸 + 星火階 + 星力」重建出來的值。實測玩家的創世長杖
// 魔攻 828，戰鬥力用的是 694，差 −134。少了這個校正戰鬥力會高約 3.4%。
//
// 上游把這四項做成手填欄位（武器套組／星火／卷軸攻／星力／武器總攻），
// 但它們全部都在 API 的裝備資料裡，沒有理由再要玩家抄一次。

import { weaponDatabase, zeroWeaponDatabase } from '@/data/weapons'
import type { WeaponSetKey } from '@/core/types'
import type { EquipmentItem, ItemOption } from '../services/nexonApi'

export interface WeaponDerived {
  /** 找不到武器時其餘欄位無意義 */
  found: boolean
  itemName: string
  /** 對不上任何系列時為空字串 —— 必須回報，不能預設成某一個系列 */
  weaponSet: WeaponSetKey | ''
  starCount: number
  /** 卷軸帶來的攻擊（item_etc_option） */
  scrollAtk: number
  /** 武器面板總攻（item_total_option） */
  currentWeaponAtk: number
  /** 星火實際數值（item_add_option），供顯示與推階 */
  flameAtk: number
  /** 由 flameAtk 推得的 T 階 0~7 */
  flameLevel: number
}

const num = (value: string | number | undefined): number => Number(value ?? 0) || 0

function optionAtk(option: ItemOption | undefined, useMagic: boolean): number {
  if (!option) return 0
  return num(useMagic ? option.magic_power : option.attack_power)
}

/**
 * 星火數值 → T 階。
 *
 * 取「不超過實際值的最大階」：星火數值同階會隨裝備等級浮動，而校正表是以階為單位。
 * 實測玩家的創世長杖星火 74 魔攻，T3=58、T4=84，取 T3 —— 與玩家自己在上游面板選的一致，
 * 而那組輸入算出來跟遊戲完全相同。
 */
export function flameLevelFor(setKey: WeaponSetKey, flameAtk: number, isZeroJob = false): number {
  const table = (isZeroJob ? zeroWeaponDatabase : weaponDatabase)[setKey]?.flames
  if (!table || flameAtk <= 0) return 0
  let level = 0
  for (let i = 0; i < table.length; i++) {
    if (table[i] <= flameAtk) level = i
  }
  return level
}

/** 武器名稱 → 系列。用系列中文名當前綴比對（創世長杖 → genesis） */
export function weaponSetFromName(itemName: string): WeaponSetKey | '' {
  for (const [key, data] of Object.entries(weaponDatabase)) {
    if (itemName.startsWith(data.name)) return key as WeaponSetKey
  }
  return ''
}

export function deriveWeapon(
  equipment: readonly EquipmentItem[],
  useMagic: boolean,
  isZeroJob = false,
): WeaponDerived {
  const empty: WeaponDerived = {
    found: false,
    itemName: '',
    weaponSet: '',
    starCount: 0,
    scrollAtk: 0,
    currentWeaponAtk: 0,
    flameAtk: 0,
    flameLevel: 0,
  }

  // 只認主武器槽；副武器與徽章不進武器校正
  const weapon = equipment.find((item) => item.item_equipment_slot === '武器')
  if (!weapon) return empty

  const weaponSet = weaponSetFromName(weapon.item_name ?? '')
  const flameAtk = optionAtk(weapon.item_add_option, useMagic)

  return {
    found: true,
    itemName: weapon.item_name ?? '',
    weaponSet,
    starCount: num(weapon.starforce),
    scrollAtk: optionAtk(weapon.item_etc_option, useMagic),
    currentWeaponAtk: optionAtk(weapon.item_total_option, useMagic),
    flameAtk,
    flameLevel: weaponSet ? flameLevelFor(weaponSet, flameAtk, isZeroJob) : 0,
  }
}
