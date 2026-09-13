// 我們的部位名稱（API 的 item_equipment_part）→ 潛能表的部位代號。
//
// 兩邊的分類粒度不同：API 給的是欄位名（長杖、短杖、盾牌…），潛能表給的是
// 潛能規則上的分類（primary-weapon、secondary-weapon…），所以要對一次。
//
// 對不上的部位（圖騰、寶石、勳章、口袋道具、輔助特殊技能戒指）就是沒有潛能欄，
// 回 null。製作台據此決定要不要顯示潛能 UI —— 遊戲裡沒有的欄位不該給玩家開。

import { isWeaponPart, SECONDARY_PARTS } from './equipSlots'
import { weaponSetFromName } from '../core/weaponDerive'

const BY_PART: Readonly<Record<string, string>> = {
  帽子: 'hat',
  上衣: 'top',
  '褲/裙': 'bottom',
  套服: 'overall',
  鞋子: 'shoes',
  手套: 'gloves',
  披風: 'cape',
  肩膀裝飾: 'shoulder',
  腰帶: 'belt',
  戒指: 'ring',
  墜飾: 'pendant',
  耳環: 'earrings',
  臉飾: 'face',
  眼飾: 'eye',
  胸章: 'badge',
  機器心臟: 'heart',
  // 遊戲裡的「徽章」就是潛能表的「能源」（emblem）；胸章是另一個欄位
  徽章: 'emblem',
}

/**
 * 這幾件副武器走另一組潛能（站方把它們獨立成一類）。
 * 判斷用名稱而不是部位：它們跟其他副武器共用同一個欄位。
 */
const SECONDARY_OTHER = ['力量之盾', '靈魂戒指']

/**
 * 部位（＋名稱）→ 潛能表的部位代號；沒有潛能欄的回 null。
 *
 * 武器要看名稱：命運系列是創世的升階版，同一條詞條數值高一階，
 * 在潛能表上是獨立的一類（destiny-weapon）。
 */
export function subcategoryOf(part: string, itemName = ''): string | null {
  const mapped = BY_PART[part]
  if (mapped) return mapped

  if (SECONDARY_PARTS.has(part)) {
    return SECONDARY_OTHER.some((n) => itemName.includes(n))
      ? 'secondary-weapon-other'
      : 'secondary-weapon'
  }

  if (isWeaponPart(part)) {
    return weaponSetFromName(itemName) === 'fortune' ? 'destiny-weapon' : 'primary-weapon'
  }

  return null
}
