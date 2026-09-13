<script setup lang="ts">
// 啟用套裝：列出身上每組套裝的件數，以及目前生效的各階效果。
//
// 件數一律由實際裝備反推，不採用 API 的 total_set_count —— 實測那個數字兩個方向
// 都會錯（見 data/equipmentSets.ts 的說明）。未達標的階層會一起列出但標成未生效，
// 這樣玩家看得到「再湊一件會拿到什麼」。
import { computed } from 'vue'
import { SET_TIERS, countSetPieces, hasSetTiers, type SetTier } from '../data/equipmentSets'
import type { SetEffectEntry } from '../services/nexonApi'
import type { StatKey } from '../core/optionParser'

const props = defineProps<{
  /**
   * 要計入套裝件數的裝備名稱，由呼叫端決定。
   *
   * 刻意收「名稱」而不是整批裝備：自製裝備在格子上顯示的是玩家自訂名稱，
   * 拿它去查套裝對照表一定查不到，會憑空少算一件（實測「測試裸底上衣」就這樣
   * 讓永恆套裝從 3 件掉到 2 件，而換裝引擎那邊用基底名稱算出來是 3 件，兩邊打架）。
   * 被拔掉的位置也必須由呼叫端排除。
   */
  itemNames: readonly string[]
  setEffects: readonly SetEffectEntry[]
}>()

const STAT_LABELS: Partial<Record<StatKey, string>> = {
  allStat: '全屬性',
  str: 'STR',
  dex: 'DEX',
  int: 'INT',
  luk: 'LUK',
  maxHp: 'MaxHP',
  maxMp: 'MaxMP',
  defense: '防禦力',
  damage: '傷害',
  bossDamage: 'BOSS傷害',
  ignoreDefense: '無視防禦率',
  critDamage: '爆擊傷害',
  critRate: '爆擊機率',
}

/** 顯示順序；比照遊戲套裝視窗，屬性在前、傷害相關在後 */
const STAT_ORDER: StatKey[] = [
  'allStat',
  'str',
  'dex',
  'int',
  'luk',
  'maxHp',
  'maxMp',
  'defense',
  'attackPower',
  'damage',
  'bossDamage',
  'ignoreDefense',
  'critDamage',
  'critRate',
]

/**
 * 一階效果 → 顯示文字。
 * 攻擊力與魔力在遊戲裡是「攻擊力/魔力 +40」一條，數值相同時合併顯示。
 */
function describe(tier: SetTier): string[] {
  const lines: string[] = []

  const emit = (source: Partial<Record<StatKey, number>> | undefined, suffix: string) => {
    if (!source) return
    const atk = source.attackPower
    const mag = source.magicPower
    const merged = atk !== undefined && atk === mag

    for (const key of STAT_ORDER) {
      const value = source[key]
      if (!value) continue
      if (key === 'attackPower') {
        lines.push(merged ? `攻擊力/魔力 +${value}${suffix}` : `攻擊力 +${value}${suffix}`)
        continue
      }
      lines.push(`${STAT_LABELS[key] ?? key} +${value}${suffix}`)
    }
    // 只有魔力、或兩者數值不同時，魔力要獨立一條
    if (mag && !merged) lines.push(`魔法攻擊力 +${mag}${suffix}`)
  }

  emit(tier.flat, '')
  emit(tier.percent, '%')
  return lines
}

interface SetRow {
  setName: string
  count: number
  /** 已收錄在自建表的套裝才有結構化階層 */
  tiers: { count: number; active: boolean; lines: string[] }[]
  /** 未收錄時退回 API 的原始文字 */
  apiLines: { count: number; text: string }[]
  known: boolean
}

const counted = computed(() => countSetPieces(props.itemNames))

/** 找 API 對應的套裝資料；自建表的名稱帶職業群後綴，API 的不帶 */
function apiEntryFor(setName: string): SetEffectEntry | undefined {
  const bare = setName.replace(/\([^)]*\)$/, '')
  return props.setEffects.find((e) => e.set_name === setName || e.set_name === bare)
}

const rows = computed<SetRow[]>(() =>
  Object.entries(counted.value.counts)
    .map(([setName, count]): SetRow => {
      const known = hasSetTiers(setName)
      const api = apiEntryFor(setName)
      return {
        setName,
        count,
        known,
        tiers: known
          ? (SET_TIERS[setName] ?? []).map((tier) => ({
              count: tier.count,
              active: tier.count <= count,
              lines: describe(tier),
            }))
          : [],
        apiLines: known
          ? []
          : (api?.set_effect_info ?? []).map((t) => ({ count: t.set_count, text: t.set_option })),
      }
    })
    // 件數多的排前面，同件數照名稱穩定排序
    .sort((a, b) => b.count - a.count || a.setName.localeCompare(b.setName)),
)

/** 有生效階層的套裝數 */
const activeCount = computed(
  () => rows.value.filter((r) => r.tiers.some((t) => t.active) || r.apiLines.length).length,
)
</script>

<template>
  <section class="mb-card">
    <h3 class="mb-card-title">
      啟用套裝
      <span class="mb-badge">{{ rows.length }} 組有件數 · {{ activeCount }} 組有效果</span>
    </h3>

    <p v-if="!rows.length" class="mb-empty">身上沒有任何已收錄的套裝部件。</p>

    <div v-else class="mb-sets">
      <article v-for="row in rows" :key="row.setName" class="mb-set">
        <header class="mb-set-head">
          <span class="mb-set-name">{{ row.setName }}</span>
          <span class="mb-set-count">{{ row.count }} 件</span>
          <span v-if="!row.known" class="mb-set-src">未收錄 · 用官方API</span>
        </header>

        <!-- 自建表：已生效與未生效的階層都列，未生效的淡化 -->
        <ul v-if="row.known" class="mb-tiers">
          <li
            v-for="tier in row.tiers"
            :key="tier.count"
            class="mb-tier"
            :class="{ off: !tier.active }"
          >
            <span class="mb-tier-n">{{ tier.count }}</span>
            <span class="mb-tier-body">
              <template v-if="tier.lines.length">
                <span v-for="line in tier.lines" :key="line" class="mb-stat">{{ line }}</span>
              </template>
              <span v-else class="mb-stat muted">只給技能，不計入能力值</span>
            </span>
          </li>
        </ul>

        <!-- 未收錄：只顯示 API 回傳的已達成階層 -->
        <ul v-else class="mb-tiers">
          <li v-for="tier in row.apiLines" :key="tier.count" class="mb-tier">
            <span class="mb-tier-n">{{ tier.count }}</span>
            <span class="mb-tier-body"
              ><span class="mb-stat raw">{{ tier.text }}</span></span
            >
          </li>
          <li v-if="!row.apiLines.length" class="mb-tier off">
            <span class="mb-tier-n">—</span>
            <span class="mb-tier-body"><span class="mb-stat muted">查不到效果內容</span></span>
          </li>
        </ul>
      </article>
    </div>

    <p v-if="counted.unknownItems.length" class="mb-warn">
      有 {{ counted.unknownItems.length }} 件裝備不在套裝對照表裡，若其中有套裝部件，件數會低估：{{
        counted.unknownItems.join('、')
      }}
    </p>
  </section>
</template>

<style scoped>
.mb-sets {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 8px;
}

.mb-set {
  padding: 7px 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.12);
}

.mb-set-head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 5px;
}

.mb-set-name {
  font-size: 12px;
  font-weight: 700;
}

.mb-set-count {
  font-size: 11px;
  color: var(--accent, #6c8cff);
  font-weight: 700;
}

.mb-set-src {
  font-size: 10px;
  opacity: 0.55;
}

.mb-tiers {
  margin: 0;
  padding: 0;
  list-style: none;
}

.mb-tier {
  display: flex;
  gap: 6px;
  padding: 2px 0;
  font-size: 11px;
  line-height: 1.45;
}

.mb-tier.off {
  opacity: 0.35;
}

.mb-tier-n {
  flex-shrink: 0;
  width: 16px;
  text-align: right;
  opacity: 0.6;
  font-variant-numeric: tabular-nums;
}

.mb-tier-body {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 8px;
}

.mb-stat {
  white-space: nowrap;
}

.mb-stat.muted {
  opacity: 0.7;
}

.mb-stat.raw {
  white-space: pre-line;
}
</style>
