<script setup lang="ts">
// 裝備變更：在已同步的裝備上疊「替換草稿」，可以一次換多件，並看整套的能力值差異。
//
// 為什麼是草稿而不是直接改寫同步下來的資料：重新同步時官方資料會整包覆蓋，
// 直接改寫的內容會被吃掉，而且改寫之後就再也算不出「跟原本差多少」。
// 草稿存在裝備組裡（localStorage），關掉頁面再回來還在。
//
// 差值一律由「整套重算」得出。換裝會改變套裝件數，掉一階套裝效果的影響往往比
// 裝備本身還大；尤其一次換多件時，分開算再相加會重複計算套裝階層的得失。
import { computed, ref, watch } from 'vue'
import { useEquipmentSetsStore } from '../stores/equipmentSets'
import { toGearForCompare, useInventoryStore, type CraftedItem } from '../stores/inventory'
import { useFamiliarStore } from '../stores/familiar'
// 戰鬥力公式是上游的純函式，我們只呼叫不修改。基準改用自己的 useBaseline
// （角色資料頁那一份），不再依賴上游手動覆寫頁的 store。
import { calculatePower, powerValue } from '@/core/combatPower'
import { equipmentFieldDelta, isEmptyDelta } from '../core/powerDelta'
import { useBaseline } from '../composables/useBaseline'
import { usePowerContext } from '../composables/usePowerContext'
import EquipmentGrid from '../components/EquipmentGrid.vue'
import ActiveSetsPanel from '../components/ActiveSetsPanel.vue'
import { fromApiItem } from '../core/gearAdapters'
import { computeLoadoutDelta, type LoadoutReplacement, type StatDiff } from '../core/equipmentDelta'
import type { EquipmentItem } from '../services/nexonApi'
import type { StatKey } from '../core/optionParser'

const sets = useEquipmentSetsStore()
const inventory = useInventoryStore()
const familiar = useFamiliarStore()

const data = computed(() => sets.active?.data ?? null)
const baseItems = computed<readonly EquipmentItem[]>(() => data.value?.equipment ?? [])
const draft = computed(() => sets.active?.draft ?? [])

/** 目前點選的格子；只用來決定右邊道具欄要列哪個部位 */
const targetIndex = ref<number | null>(null)

watch(
  () => sets.activeId,
  () => {
    targetIndex.value = null
  },
)

const draftByIndex = computed(() => new Map(draft.value.map((entry) => [entry.index, entry])))

const craftedById = computed(() => new Map(inventory.items.map((item) => [item.id, item])))

/**
 * 自製裝備轉成格子顯示得了的形狀。
 * 四層數值的命名不同（自製是駝峰、API 是底線），但格子那邊一律經過
 * normalizeLayer，兩種都吃得下，所以直接塞進同一個欄位即可。
 */
function craftedToDisplayItem(crafted: CraftedItem, part: string): EquipmentItem {
  return {
    item_name: crafted.name || crafted.baseName,
    item_equipment_part: part,
    item_equipment_slot: part,
    starforce: String(crafted.starCount ?? 0),
    item_base_option: crafted.base,
    item_starforce_option: crafted.starforce,
    item_etc_option: crafted.etc,
    item_add_option: crafted.add,
    item_total_option: {},
    potential_option_grade: null,
    potential_option_1: crafted.potentials[0] ?? null,
    potential_option_2: crafted.potentials[1] ?? null,
    potential_option_3: crafted.potentials[2] ?? null,
    additional_potential_option_grade: null,
    additional_potential_option_1: crafted.additionalPotentials[0] ?? null,
    additional_potential_option_2: crafted.additionalPotentials[1] ?? null,
    additional_potential_option_3: crafted.additionalPotentials[2] ?? null,
  } as unknown as EquipmentItem
}

type SlotState = 'original' | 'replaced' | 'removed'

interface EffectiveSlot {
  item: EquipmentItem
  state: SlotState
  /**
   * 計算套裝件數時要用的名稱；null 代表不計入（被拔掉）。
   *
   * 與格子上顯示的名稱刻意分開：自製裝備顯示的是玩家自訂名稱，套裝對照表只認
   * 基底名稱。兩者混用會讓「啟用套裝」與換裝引擎算出不同的件數。
   */
  setName: string | null
}

/**
 * 套用草稿之後的裝備欄。
 *
 * 陣列長度與部位刻意保持不變 —— 被拔掉的位置留著原本那件並標記成 removed，
 * 否則格子會依部位重新分派，後面的裝備位置全部跑掉，草稿記的 index 就對不上了。
 */
const effective = computed<EffectiveSlot[]>(() =>
  baseItems.value.map((item, index): EffectiveSlot => {
    const entry = draftByIndex.value.get(index)
    if (!entry) return { item, state: 'original', setName: item.item_name }
    if (entry.itemId === null) return { item, state: 'removed', setName: null }

    const crafted = craftedById.value.get(entry.itemId)
    // 草稿指向已被刪掉的自製裝備：顯示回原本那件，並在下面提示
    if (!crafted) return { item, state: 'original', setName: item.item_name }
    return {
      item: craftedToDisplayItem(crafted, item.item_equipment_part),
      state: 'replaced',
      setName: crafted.baseName,
    }
  }),
)

const displayItems = computed(() => effective.value.map((slot) => slot.item))

/** 套用替換之後、真正該計入套裝的裝備名稱 */
const setCountNames = computed(() =>
  effective.value.map((slot) => slot.setName).filter((name): name is string => name !== null),
)

const slotStates = computed<Record<number, 'replaced' | 'removed'>>(() => {
  const result: Record<number, 'replaced' | 'removed'> = {}
  effective.value.forEach((slot, index) => {
    if (slot.state !== 'original') result[index] = slot.state
  })
  return result
})

/** 草稿指向的自製裝備已經不在物品欄了 */
const danglingDrafts = computed(() =>
  draft.value.filter((entry) => entry.itemId !== null && !craftedById.value.has(entry.itemId)),
)

const replacements = computed<LoadoutReplacement[]>(() =>
  draft.value.flatMap((entry): LoadoutReplacement[] => {
    if (entry.itemId === null) return [{ index: entry.index, replacement: null }]
    const crafted = craftedById.value.get(entry.itemId)
    return crafted ? [{ index: entry.index, replacement: toGearForCompare(crafted) }] : []
  }),
)

const result = computed(() => {
  const current = data.value
  if (!current || !replacements.value.length) return null

  return computeLoadoutDelta({
    items: baseItems.value.map(fromApiItem),
    // 舊版同步的資料沒有套裝效果欄位；已收錄的套裝不依賴它，未收錄的才會少算
    setEffects: current.setEffects ?? [],
    characterLevel: current.level,
    replacements: replacements.value,
  })
})

// ── 換裝後的戰鬥力 ────────────────────────────────
//
// 為什麼需要「基準」：API 的 final_stat 是合成後的面板值，拆不回公式要的
// 基本數值／％／％未套用（實測反推出 0.687 的終傷倍率，不可能）。
// 基準由 useBaseline 組裝：AP配點／裝備／符文／極限屬性自動推導，其餘手填。
// 換裝前後用同一份基準，差值才會是精確的。
//
// 職業一律取**同步下來的角色**，所以不會有「基準職業與角色不一致」的問題。
const { fields: baselineFields, slots, reconciled } = useBaseline()

const powerContext = usePowerContext()

const powerChange = computed(() => {
  const swap = result.value
  const statSlots = slots.value
  const base = baselineFields.value
  if (!swap || !statSlots || !base) return null

  const delta = equipmentFieldDelta(swap.before, swap.after, statSlots)
  if (isEmptyDelta(delta)) return null

  const before = powerValue(calculatePower(base, powerContext.value))
  const after = powerValue(calculatePower(base, powerContext.value, delta))
  return { before, after, diff: after - before }
})

function formatPower(value: number): string {
  return Math.abs(value).toLocaleString('en-US')
}

// ── 道具欄 ────────────────────────────────────────
const targetPart = computed(() =>
  targetIndex.value === null ? '' : (baseItems.value[targetIndex.value]?.item_equipment_part ?? ''),
)

const candidates = computed(() =>
  targetPart.value ? inventory.items.filter((item) => item.part === targetPart.value) : [],
)

const currentDraft = computed(() =>
  targetIndex.value === null ? undefined : draftByIndex.value.get(targetIndex.value),
)

function replaceWith(itemId: string): void {
  if (targetIndex.value === null || !sets.active) return
  sets.setDraftEntry(sets.active.id, targetIndex.value, itemId)
}

function removeSlot(): void {
  if (targetIndex.value === null || !sets.active) return
  sets.setDraftEntry(sets.active.id, targetIndex.value, null)
}

function restoreSlot(index: number): void {
  if (!sets.active) return
  sets.setDraftEntry(sets.active.id, index, undefined)
}

function clearAll(): void {
  if (sets.active) sets.clearDraft(sets.active.id)
}

/** 替換清單：原本那件 → 換成什麼 */
const changeList = computed(() =>
  draft.value
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((entry) => ({
      index: entry.index,
      from: baseItems.value[entry.index]?.item_name ?? '（找不到）',
      to:
        entry.itemId === null
          ? '拔掉'
          : (craftedById.value.get(entry.itemId)?.name ?? '（自製裝備已刪除）'),
    })),
)

// ── 差異表 ────────────────────────────────────────
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
          <span v-if="item.draft.length" class="mb-tab-dot">{{ item.draft.length }}</span>
        </button>
      </div>

      <div class="mb-cmp-grid">
        <!-- 裝備欄 -->
        <section class="mb-card">
          <h3 class="mb-card-title">
            裝備欄
            <span class="mb-badge">{{ sets.active?.name }} · {{ baseItems.length }} 件</span>
            <button v-if="draft.length" type="button" class="mb-link" @click="clearAll">
              清除全部替換（{{ draft.length }}）
            </button>
          </h3>
          <EquipmentGrid
            :equipment="displayItems"
            :pets="data.pets ?? []"
            :selected-index="targetIndex"
            :states="slotStates"
            :familiar="{ total: familiar.totalPercent, count: familiar.sources.length }"
            @select="targetIndex = $event"
          />
        </section>

        <!-- 道具欄 -->
        <section class="mb-card">
          <h3 class="mb-card-title">
            道具欄
            <span v-if="targetPart" class="mb-badge">可換到「{{ targetPart }}」</span>
          </h3>

          <p v-if="targetIndex === null" class="mb-empty">先在左邊點一件要換掉的裝備。</p>

          <template v-else>
            <ul class="mb-list">
              <li v-if="currentDraft" class="mb-item restore" @click="restoreSlot(targetIndex)">
                <span class="mb-item-part">↩</span>
                <span class="mb-item-name">還原成原本的裝備</span>
              </li>
              <li
                class="mb-item"
                :class="{ active: currentDraft?.itemId === null }"
                @click="removeSlot"
              >
                <span class="mb-item-part">—</span>
                <span class="mb-item-name">直接拔掉（看這件貢獻多少）</span>
              </li>
              <li
                v-for="item in candidates"
                :key="item.id"
                class="mb-item"
                :class="{ active: currentDraft?.itemId === item.id }"
                @click="replaceWith(item.id)"
              >
                <span class="mb-item-part">{{ item.part }}</span>
                <span class="mb-item-name">{{ item.name }}</span>
                <span v-if="item.starCount" class="mb-item-star">★{{ item.starCount }}</span>
              </li>
            </ul>
            <p v-if="!candidates.length" class="mb-hint">
              物品欄沒有「{{ targetPart }}」部位的自製裝備，到「製作台」做一件再回來比較。
            </p>
          </template>
        </section>
      </div>

      <!-- 已替換清單 -->
      <section v-if="changeList.length" class="mb-card">
        <h3 class="mb-card-title">
          已替換
          <span class="mb-badge">{{ changeList.length }} 件 · 已存檔</span>
        </h3>
        <ul class="mb-changes">
          <li v-for="change in changeList" :key="change.index">
            <span class="mb-from">{{ change.from }}</span>
            <span class="mb-arrow">→</span>
            <span class="mb-to" :class="{ removed: change.to === '拔掉' }">{{ change.to }}</span>
            <button type="button" class="mb-link" @click="restoreSlot(change.index)">還原</button>
          </li>
        </ul>
        <p v-if="danglingDrafts.length" class="mb-warn">
          有 {{ danglingDrafts.length }}
          筆替換指向已經被刪掉的自製裝備，這幾件沒有計入差異，請重新指定或還原。
        </p>
      </section>

      <!-- 啟用套裝（已套用替換後的結果） -->
      <ActiveSetsPanel :item-names="setCountNames" :set-effects="data.setEffects ?? []" />

      <!-- 換裝後的戰鬥力 -->
      <section v-if="result" class="mb-card">
        <h3 class="mb-card-title">戰鬥力</h3>

        <div v-if="powerChange" class="mb-power-row">
          <span class="mb-power-before">{{ formatPower(powerChange.before) }}</span>
          <span class="mb-power-arrow">→</span>
          <span class="mb-power-after">{{ formatPower(powerChange.after) }}</span>
          <span class="mb-power-diff" :class="powerChange.diff >= 0 ? 'pos' : 'neg'">
            {{ powerChange.diff >= 0 ? '+' : '−' }}{{ formatPower(powerChange.diff) }}
          </span>
        </div>

        <p v-else-if="!slots" class="mb-hint">
          這個職業的主屬是 HP，戰鬥力走的是另一條公式路徑，目前還不支援換裝差值。
        </p>

        <p v-else class="mb-empty">這次換裝不影響戰鬥力。</p>

        <p v-if="powerChange && !reconciled" class="mb-warn">
          基準<b>還沒對帳相符</b>，所以上面的絕對值會偏掉，差值也只能參考。
          到「角色資料」頁最下面的「戰鬥力基準」把缺的來源補到顯示<b>對帳相符</b>為止，
          這裡的數字才會準。
        </p>
      </section>

      <!-- 比較結果 -->
      <section v-if="result" class="mb-card">
        <h3 class="mb-card-title">整套差異</h3>

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

.mb-link {
  margin-left: auto;
  padding: 0;
  border: 0;
  background: none;
  color: var(--accent, #6c8cff);
  font-size: 11px;
  cursor: pointer;
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
  position: relative;
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

.mb-tab-dot {
  margin-left: 4px;
  padding: 0 5px;
  border-radius: 999px;
  background: #7fe0a0;
  color: #10301c;
  font-size: 10px;
  font-weight: 700;
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

.mb-item.restore {
  color: #7fe0a0;
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

.mb-changes {
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12px;
}

.mb-changes li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.mb-changes li:first-child {
  border-top: 0;
}

.mb-from {
  opacity: 0.6;
}

.mb-arrow {
  opacity: 0.4;
}

.mb-to {
  color: #7fe0a0;
}

.mb-to.removed {
  color: #ff9090;
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

/* 戰鬥力 */
.mb-power-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-variant-numeric: tabular-nums;
}

.mb-power-before {
  font-size: 13px;
  opacity: 0.6;
}

.mb-power-arrow {
  opacity: 0.4;
}

.mb-power-after {
  font-size: 17px;
  font-weight: 700;
}

.mb-power-diff {
  margin-left: auto;
  font-size: 14px;
  font-weight: 700;
}

.mb-power-diff.pos {
  color: #7fe0a0;
}

.mb-power-diff.neg {
  color: #ff9090;
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
