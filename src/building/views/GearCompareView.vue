<script setup lang="ts">
// 裝備變更：以一組已同步的裝備為基準，從物品欄挑一件替換，看換裝前後的能力值差異。
//
// 裝備欄跟著裝備組走；物品欄是全域的（製作台做出來的自製裝備）。
// 差值由換裝比較引擎「重算整套」得出 —— 換裝會改變套裝件數，掉一階套裝效果的
// 影響往往比裝備本身還大，不能只把兩件相減。
import { computed, ref, watch } from 'vue'
import { useEquipmentSetsStore } from '../stores/equipmentSets'
import { toGearForCompare, useInventoryStore } from '../stores/inventory'
import { fromApiItem } from '../core/gearAdapters'
import { computeSwapDelta, type StatDiff } from '../core/equipmentDelta'
import type { StatKey } from '../core/optionParser'

const sets = useEquipmentSetsStore()
const inventory = useInventoryStore()

const REMOVE = '__remove__'

const data = computed(() => sets.active?.data ?? null)
const equipped = computed(() => (data.value?.equipment ?? []).map(fromApiItem))

/** 用位置而不是名稱指定要換的那件 —— 身上可能同時戴兩顆同名戒指 */
const targetIndex = ref<number | null>(null)
const replacementId = ref('')

watch(
  () => sets.activeId,
  () => {
    targetIndex.value = null
    replacementId.value = ''
  },
)
watch(targetIndex, () => {
  replacementId.value = ''
})

const target = computed(() =>
  targetIndex.value === null ? null : (equipped.value[targetIndex.value] ?? null),
)

const candidates = computed(() =>
  target.value ? inventory.items.filter((item) => item.part === target.value?.part) : [],
)

const replacementLabel = computed(() => {
  if (replacementId.value === REMOVE) return '直接拔掉'
  return inventory.items.find((i) => i.id === replacementId.value)?.name ?? ''
})

const result = computed(() => {
  const d = data.value
  if (!d || targetIndex.value === null || !target.value || !replacementId.value) return null

  let replacement = null
  if (replacementId.value !== REMOVE) {
    const crafted = inventory.items.find((i) => i.id === replacementId.value)
    if (!crafted) return null
    replacement = toGearForCompare(crafted)
  }

  return computeSwapDelta({
    items: equipped.value,
    // 舊版同步的資料沒有套裝效果欄位；已收錄的套裝不依賴它，未收錄的才會少算
    setEffects: d.setEffects ?? [],
    characterLevel: d.level,
    replaceName: target.value.name,
    replaceIndex: targetIndex.value,
    replacement,
  })
})

const STAT_LABELS: Partial<Record<StatKey, string>> = {
  str: 'STR',
  dex: 'DEX',
  int: 'INT',
  luk: 'LUK',
  attackPower: '攻擊力',
  magicPower: '魔法攻擊力',
  damage: '傷害',
  bossDamage: 'BOSS 傷害',
  normalMobDamage: '一般怪物傷害',
  critDamage: '爆擊傷害',
  critRate: '爆擊機率',
  ignoreDefense: '無視防禦率',
  maxHp: 'MaxHP',
  maxMp: 'MaxMP',
  defense: '防禦力',
}

/** 移動速度、楓幣獲得量這類與戰鬥力無關的欄位不列出 */
const visibleDiffs = computed(() =>
  (result.value?.diffs ?? []).filter((diff) => STAT_LABELS[diff.stat]),
)

function label(diff: StatDiff): string {
  return `${STAT_LABELS[diff.stat]}${diff.kind === 'percent' ? ' %' : ''}`
}

function fmt(n: number): string {
  const rounded = Math.round(n * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)
}

function signed(n: number): string {
  return `${n > 0 ? '+' : ''}${fmt(n)}`
}

function starOf(index: number): number {
  return Number(data.value?.equipment[index]?.starforce ?? 0)
}
</script>

<template>
  <div class="mb-cmp">
    <section v-if="!data" class="mb-card mb-empty">
      還沒有同步過的裝備組。先到「裝備組」同步一次，裝備欄才有東西可以換。
    </section>

    <template v-else>
      <!-- 選基準裝備組 -->
      <div class="mb-set-tabs" aria-label="選擇基準裝備組">
        <button
          v-for="item in sets.sets"
          :key="item.id"
          type="button"
          class="mb-set-tab"
          :class="{ active: item.id === sets.activeId }"
          :disabled="!item.data"
          @click="sets.setActive(item.id)"
        >
          {{ item.name }}
        </button>
      </div>

      <div class="mb-cmp-grid">
        <!-- 裝備欄 -->
        <section class="mb-card">
          <h3 class="mb-card-title">
            裝備欄
            <span class="mb-badge">{{ sets.active?.name }} · {{ equipped.length }} 件</span>
          </h3>
          <ul class="mb-list">
            <li
              v-for="(item, i) in equipped"
              :key="`${item.name}-${i}`"
              class="mb-item"
              :class="{ active: i === targetIndex }"
              @click="targetIndex = i"
            >
              <span class="mb-item-part">{{ item.part }}</span>
              <span class="mb-item-name">{{ item.name }}</span>
              <span v-if="starOf(i)" class="mb-item-star">★{{ starOf(i) }}</span>
            </li>
          </ul>
        </section>

        <!-- 道具欄 -->
        <section class="mb-card">
          <h3 class="mb-card-title">
            道具欄
            <span v-if="target" class="mb-badge">可換到「{{ target.part }}」</span>
          </h3>

          <p v-if="!target" class="mb-empty">先在左邊點一件要換掉的裝備。</p>

          <template v-else>
            <ul class="mb-list">
              <li
                class="mb-item"
                :class="{ active: replacementId === REMOVE }"
                @click="replacementId = REMOVE"
              >
                <span class="mb-item-part">—</span>
                <span class="mb-item-name">直接拔掉（看這件貢獻多少）</span>
              </li>
              <li
                v-for="item in candidates"
                :key="item.id"
                class="mb-item"
                :class="{ active: replacementId === item.id }"
                @click="replacementId = item.id"
              >
                <span class="mb-item-part">{{ item.part }}</span>
                <span class="mb-item-name">{{ item.name }}</span>
                <span v-if="item.starCount" class="mb-item-star">★{{ item.starCount }}</span>
              </li>
            </ul>
            <p v-if="!candidates.length" class="mb-hint">
              物品欄沒有「{{ target.part }}」部位的自製裝備，到「製作台」做一件再回來比較。
            </p>
          </template>
        </section>
      </div>

      <!-- 比較結果 -->
      <section v-if="result && target" class="mb-card">
        <h3 class="mb-card-title">{{ target.name }} → {{ replacementLabel }}</h3>

        <div v-if="result.setChanges.length" class="mb-set-changes">
          <span
            v-for="change in result.setChanges"
            :key="change.setName"
            class="mb-chip"
            :class="change.after < change.before ? 'down' : 'up'"
          >
            {{ change.setName }}　{{ change.before }} → {{ change.after }} 件
          </span>
        </div>

        <table v-if="visibleDiffs.length" class="mb-diff">
          <thead>
            <tr>
              <th>能力值</th>
              <th>換裝前</th>
              <th>換裝後</th>
              <th>差異</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="diff in visibleDiffs" :key="`${diff.stat}-${diff.kind}`">
              <td>{{ label(diff) }}</td>
              <td>{{ fmt(diff.before) }}</td>
              <td>{{ fmt(diff.after) }}</td>
              <td :class="diff.delta > 0 ? 'pos' : 'neg'">{{ signed(diff.delta) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="mb-empty">沒有任何能力值變化。</p>

        <p v-if="result.unrecognized.length" class="mb-warn">
          有 {{ result.unrecognized.length }} 條潛能無法換算、未計入：{{
            result.unrecognized.join('、')
          }}
        </p>
        <p class="mb-hint">
          只比較裝備與套裝效果。寵物、技能、聯盟等不受換裝影響的來源在前後相同，比較時會自動抵銷。
        </p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.mb-cmp {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 0 24px;
}

.mb-card {
  background: var(--surface-1, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--outline, rgba(255, 255, 255, 0.12));
  border-radius: 10px;
  padding: 10px 12px;
}

.mb-card-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 700;
}

.mb-badge {
  font-size: 11px;
  font-weight: 400;
  opacity: 0.7;
}

.mb-empty {
  margin: 0;
  padding: 8px 0;
  font-size: 12px;
  text-align: center;
  opacity: 0.7;
}

.mb-hint {
  margin: 8px 0 0;
  font-size: 11px;
  line-height: 1.5;
  opacity: 0.65;
}

.mb-warn {
  margin: 8px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: #ffc857;
}

.mb-set-tabs {
  display: flex;
  gap: 4px;
}

.mb-set-tab {
  flex: 1;
  min-width: 0;
  height: 30px;
  border: 1px solid var(--outline, rgba(255, 255, 255, 0.14));
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  cursor: pointer;
}

.mb-set-tab.active {
  border-color: transparent;
  background: var(--accent, #6c8cff);
  color: #fff;
}

.mb-set-tab:disabled {
  opacity: 0.35;
  cursor: default;
}

.mb-cmp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 10px;
}

.mb-list {
  max-height: 42vh;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.mb-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 6px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}

.mb-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.mb-item.active {
  background: rgba(255, 255, 255, 0.14);
}

.mb-item-part {
  width: 68px;
  flex-shrink: 0;
  font-size: 11px;
  opacity: 0.6;
}

.mb-item-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mb-item-star {
  color: #ffc857;
  font-size: 11px;
}

.mb-set-changes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.mb-chip {
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
}

.mb-chip.down {
  background: rgba(255, 110, 110, 0.2);
  color: #ffb0b0;
}

.mb-chip.up {
  background: rgba(110, 220, 150, 0.2);
  color: #a8f0c0;
}

.mb-diff {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.mb-diff th {
  padding: 4px 6px;
  font-weight: 400;
  opacity: 0.6;
  text-align: right;
}

.mb-diff th:first-child,
.mb-diff td:first-child {
  text-align: left;
}

.mb-diff td {
  padding: 4px 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  text-align: right;
}

.mb-diff td.pos {
  color: #7fe0a0;
  font-weight: 700;
}

.mb-diff td.neg {
  color: #ff9090;
  font-weight: 700;
}
</style>
