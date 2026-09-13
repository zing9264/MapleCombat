// 武器系列選單。
//
// 名稱與數值都來自上游的 weaponDatabase，這裡只是把它轉成選單用的形狀 ——
// 複製一份名稱清單遲早會跟上游分岔。

import { weaponDatabase } from '@/data/weapons'
import type { WeaponSetKey } from '@/core/types'

export const WEAPON_SET_OPTIONS: ReadonlyArray<{ value: WeaponSetKey; label: string }> =
  Object.entries(weaponDatabase).map(([value, data]) => ({
    value: value as WeaponSetKey,
    label: data.name,
  }))
