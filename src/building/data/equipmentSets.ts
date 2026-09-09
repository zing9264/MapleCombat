// 套裝成員對照表。
//
// 為什麼需要這張表：NEXON API 的 `set_effect.total_set_count` **兩個方向都會錯**，
// 實測與遊戲內套裝視窗比對的結果：
//
//   航海師套裝(法師)   API 3 → 實際 4   創世長杖以「幸運道具」身分計入，API 沒算
//   永恆套裝(法師)     API 2 → 實際 3   創世長杖本身是永恆套裝武器，API 沒算
//   神祕冥界套裝(法師) API 3 → 實際 2   API 多算
//   小小時光音樂會套組 API 3 → 實際 2   API 多算
//
// 由於件數決定哪幾階效果生效，件數錯 = 能力值加總錯。因此件數必須由實際
// 裝備反推，不能採用 API 的數字。各階「效果內容」則可以信任 API。
//
// 資料來源：遊戲內套裝效果視窗。目前只涵蓋已驗證過的套裝，未列出的套裝
// 會退回使用 API 件數（並由呼叫端標記為未驗證）。

/** 一件裝備屬於哪些套裝。同一件可以同時計入多組（例如創世武器）。 */
export interface SetMembership {
  /** `item_equipment` 的 `item_name` */
  itemName: string
  setNames: string[]
}

/**
 * 創世／命運武器同時屬於永恆套裝，又能以「幸運道具」身分計入另一組套裝。
 * 這是 API 件數出錯的主因，必須特別處理。
 */
export const LUCKY_ITEM_NAMES: ReadonlySet<string> = new Set(['創世長杖', '命運長杖'])

export const SET_MEMBERSHIPS: readonly SetMembership[] = [
  // ── 永恆套裝(法師) ────────────────────────────
  { itemName: '永恆法師長袍', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆法師褲', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆法師帽', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆法師肩膀', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆法師手套', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆法師鞋', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆法師斗篷', setNames: ['永恆套裝(法師)'] },
  // 創世長杖同時算永恆套裝的武器欄，以及一組幸運道具指定的套裝
  { itemName: '創世長杖', setNames: ['永恆套裝(法師)', '航海師套裝(法師)'] },

  // ── 航海師套裝(法師) ──────────────────────────
  { itemName: '航海師法師鞋', setNames: ['航海師套裝(法師)'] },
  { itemName: '航海師法師斗篷', setNames: ['航海師套裝(法師)'] },
  { itemName: '航海師法師護肩', setNames: ['航海師套裝(法師)'] },
  { itemName: '航海師法師帽', setNames: ['航海師套裝(法師)'] },
  { itemName: '航海師法師套裝', setNames: ['航海師套裝(法師)'] },
  { itemName: '航海師法師手套', setNames: ['航海師套裝(法師)'] },

  // ── 神祕冥界套裝(法師) ────────────────────────
  { itemName: '神祕冥界幽靈魔法帽', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈魔導士手套', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈魔導士套裝', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈魔導士鞋子', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈法師斗篷', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈魔法護肩', setNames: ['神祕冥界套裝(法師)'] },

  // ── 頂級培羅德套裝（全 4 件已驗證）────────────
  { itemName: '頂級培羅德耳環', setNames: ['頂級培羅德套裝'] },
  { itemName: '頂級培羅德烙印墜飾', setNames: ['頂級培羅德套裝'] },
  { itemName: '頂級培羅德烙印腰帶', setNames: ['頂級培羅德套裝'] },
  { itemName: '頂級培羅德戒指', setNames: ['頂級培羅德套裝'] },

  // ── 漆黑BOSS套裝（成員名稱不規則，只能逐一列）──
  { itemName: '口紅控制器標誌', setNames: ['漆黑BOSS套裝'] },
  { itemName: '附有魔力的眼罩', setNames: ['漆黑BOSS套裝'] },
  { itemName: '苦痛的根源', setNames: ['漆黑BOSS套裝'] },
  { itemName: '巨大的恐怖', setNames: ['漆黑BOSS套裝'] },
  { itemName: '受詛咒的青魔導書', setNames: ['漆黑BOSS套裝'] },
  { itemName: '黑心', setNames: ['漆黑BOSS套裝'] },
  { itemName: '全面控制核心', setNames: ['漆黑BOSS套裝'] },
  { itemName: '夢幻的腰帶', setNames: ['漆黑BOSS套裝'] },
  { itemName: '創世的胸章', setNames: ['漆黑BOSS套裝'] },
  { itemName: '指揮官力量耳環', setNames: ['漆黑BOSS套裝'] },

  // ── 死後世界的的痕跡（圖騰）───────────────────
  { itemName: '萬事的痕跡', setNames: ['死後世界的的痕跡'] },
  { itemName: '阿德勒的痕跡', setNames: ['死後世界的的痕跡'] },
  { itemName: '貝奧武夫的痕跡', setNames: ['死後世界的的痕跡'] },
  { itemName: '柏林的痕跡', setNames: ['死後世界的的痕跡'] },
]

const BY_ITEM_NAME = new Map<string, string[]>(SET_MEMBERSHIPS.map((m) => [m.itemName, m.setNames]))

export interface SetCountResult {
  counts: Record<string, number>
  /** 對照表裡查不到的裝備名稱，UI 應提示這些可能導致套裝件數低估 */
  unknownItems: string[]
}

/**
 * 從實際穿戴的裝備反推每組套裝的件數。
 *
 * 刻意回報查不到的裝備而不是靜默略過 —— 少算一件就可能少掉一整階套裝效果，
 * 那是幾十點能力值的差距，不能讓它無聲發生。
 */
export function countSetPieces(itemNames: readonly string[]): SetCountResult {
  const counts: Record<string, number> = {}
  const unknownItems: string[] = []

  for (const name of itemNames) {
    const sets = BY_ITEM_NAME.get(name)
    if (!sets) {
      unknownItems.push(name)
      continue
    }
    for (const setName of sets) counts[setName] = (counts[setName] ?? 0) + 1
  }

  return { counts, unknownItems }
}
