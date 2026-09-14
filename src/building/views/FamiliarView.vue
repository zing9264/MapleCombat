<script setup lang="ts">
// 萌獸：照遊戲的結構 —— 一隻萌獸三條詞條，一次召喚一隻，另外有羈絆欄位。
//
// 資料從「同步裝備」一起撈回來（/character/familiar）。API 給的是**實際生效的
// 數值**，不是詞條表上的滿值 —— 暗黑半人馬就是魔攻 14%、終傷 20%，跟遊戲畫面
// 一致。所以這頁預設不需要玩家輸入任何數字，只要指定誰上場。
//
// 為什麼分成「上場中」與「沒上場」兩段：同步回來通常是一百多隻，全部攤成卡片
// 沒人找得到東西。會影響戰鬥力的只有上場的那幾隻，其餘用搜尋挑就好。
//
// 實際的替換在「裝備變更」頁做，這裡負責指定位置與（必要時）手動修正。

import { computed, ref } from 'vue'
import {
  LINES_PER_FAMILIAR,
  MAX_BOND_SLOTS,
  useFamiliarStore,
  type Familiar,
  type FamiliarSlot,
} from '../stores/familiar'
import { FAMILIAR_LINE_GROUPS, familiarLineText } from '../data/familiarLines'

const familiar = useFamiliarStore()

const SLOT_OPTIONS: ReadonlyArray<{ value: FamiliarSlot; label: string }> = [
  { value: null, label: '沒上場' },
  { value: 'summon', label: '召喚中' },
  { value: 'bond', label: '羈絆' },
]

const totals = computed(() => familiar.current)

const search = ref('')
const category = ref('')

/** 一次只畫這麼多；一百多隻全畫出來會拖慢輸入，而且沒人往下捲那麼遠 */
const PAGE_SIZE = 40
const shown = ref(PAGE_SIZE)

const categories = computed(() => {
  const found = new Set<string>()
  for (const item of familiar.list) if (item.category) found.add(item.category)
  return [...found].sort()
})

const bench = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  return familiar.list.filter((item) => {
    if (item.slot) return false
    if (category.value && item.category !== category.value) return false
    if (!keyword) return true
    return (
      item.name.toLowerCase().includes(keyword) ||
      item.lines.some((line) => line.name.toLowerCase().includes(keyword))
    )
  })
})

const visible = computed(() => bench.value.slice(0, shown.value))

function summaryOf(item: Familiar): string {
  const parts = item.lines.filter((line) => line.name).map((l) => familiarLineText(l.name, l.value))
  return parts.join('、') || '（沒有詞條）'
}

function onName(id: string, event: Event): void {
  familiar.update(id, { name: (event.target as HTMLInputElement).value })
}

function onSlot(id: string, event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  familiar.setSlot(id, value === '' ? null : (value as FamiliarSlot))
}

function onLineName(id: string, index: number, event: Event): void {
  familiar.updateLine(id, index, { name: (event.target as HTMLSelectElement).value })
}

function onLineValue(id: string, index: number, event: Event): void {
  familiar.updateLine(id, index, { value: Number((event.target as HTMLInputElement).value) || 0 })
}

/** 新增一隻空的，位置預設沒上場 —— 建檔跟上場是兩回事 */
function addFamiliar(): void {
  familiar.add({ name: '' })
}

function slotValue(item: Familiar): string {
  return item.slot ?? ''
}
</script>

<template>
  <div class="mb-fam-page">
    <section class="mb-card">
      <h3 class="mb-card-title">
        萌獸
        <span class="mb-badge">
          {{ familiar.list.length }} 隻 · 召喚中
          {{ familiar.summoned?.name || (familiar.summoned ? '（未命名）' : '無') }} · 羈絆
          {{ familiar.bonds.length }} / {{ MAX_BOND_SLOTS }}
        </span>
      </h3>

      <p class="mb-fam-total">
        生效合計：終傷
        <b>{{ totals.finalDamageTotal }}%</b>
        （×{{ totals.multiplier.toFixed(4) }}）
        <template v-if="totals.magicPowerPercent">
          · 魔攻 +{{ totals.magicPowerPercent }}%
        </template>
        <template v-if="totals.attackPowerPercent">
          · 物攻 +{{ totals.attackPowerPercent }}%
        </template>
        <template v-if="totals.allStatPercent"> · 全屬性 +{{ totals.allStatPercent }}% </template>
      </p>
      <p class="mb-hint mb-fam-check">
        上面的終傷 <b>{{ totals.finalDamageTotal }}%</b> 應該等於遊戲內「最終傷害」提示框裡
        <b>［套用中的數值］的「萌獸」那一行</b>。對不上就是這裡的詞條跟遊戲不一致。
      </p>

      <p v-if="!familiar.list.length" class="mb-hint">
        還沒有任何萌獸。到「同步裝備」按同步就會一起撈回來 ——
        詞條與數值都是遊戲當下的實際值，不用自己輸入。
      </p>

      <template v-if="familiar.active.length">
        <h4 class="mb-fam-section">上場中</h4>
        <div v-for="item in familiar.active" :key="item.id" class="mb-fam">
          <div class="mb-fam-head">
            <select
              class="mb-input mb-fam-slot"
              :value="slotValue(item)"
              @change="onSlot(item.id, $event)"
            >
              <option v-for="opt in SLOT_OPTIONS" :key="opt.label" :value="opt.value ?? ''">
                {{ opt.label }}
              </option>
            </select>
            <input
              class="mb-input mb-input--grow"
              placeholder="萌獸名稱（例：暗黑半人馬）"
              :value="item.name"
              @input="onName(item.id, $event)"
            />
            <span v-if="item.category" class="mb-fam-cat">{{ item.category }}</span>
            <button class="mb-btn mb-btn--sm" @click="familiar.remove(item.id)">刪除</button>
          </div>

          <div v-for="index in LINES_PER_FAMILIAR" :key="index" class="mb-fam-line">
            <select
              class="mb-input"
              :value="item.lines[index - 1].name"
              @change="onLineName(item.id, index - 1, $event)"
            >
              <option value="">第 {{ index }} 條（空白）</option>
              <optgroup
                v-for="group in FAMILIAR_LINE_GROUPS"
                :key="group.label"
                :label="group.label"
              >
                <option v-for="line in group.lines" :key="line.name" :value="line.name">
                  {{ line.name }}
                </option>
              </optgroup>
            </select>
            <input
              class="mb-input mb-fam-value"
              type="number"
              :value="item.lines[index - 1].value"
              @input="onLineValue(item.id, index - 1, $event)"
            />
          </div>
        </div>
      </template>

      <template v-if="familiar.list.length">
        <h4 class="mb-fam-section">
          沒上場
          <span class="mb-badge">{{ bench.length }} 隻</span>
        </h4>
        <div class="mb-row mb-fam-filter">
          <input
            v-model="search"
            class="mb-input mb-input--grow"
            type="search"
            placeholder="搜尋名稱或詞條"
          />
          <select v-model="category" class="mb-input mb-fam-catsel">
            <option value="">全部分類</option>
            <option v-for="name in categories" :key="name" :value="name">{{ name }}</option>
          </select>
        </div>

        <ul class="mb-fam-list">
          <li v-for="item in visible" :key="item.id">
            <div class="mb-fam-listname">
              {{ item.name || '（未命名）' }}
              <span v-if="item.category" class="mb-fam-cat">{{ item.category }}</span>
            </div>
            <div class="mb-fam-listlines" :title="summaryOf(item)">{{ summaryOf(item) }}</div>
            <div class="mb-fam-listact">
              <button class="mb-btn mb-btn--sm" @click="familiar.setSlot(item.id, 'summon')">
                召喚
              </button>
              <button class="mb-btn mb-btn--sm" @click="familiar.setSlot(item.id, 'bond')">
                羈絆
              </button>
            </div>
          </li>
        </ul>
        <p v-if="!bench.length" class="mb-hint">沒有符合的萌獸。</p>
        <div v-if="bench.length > shown" class="mb-row">
          <button class="mb-btn" @click="shown += PAGE_SIZE">
            還有 {{ bench.length - shown }} 隻，再顯示 {{ PAGE_SIZE }} 隻
          </button>
        </div>
      </template>

      <p v-if="familiar.lastError" class="mb-error">{{ familiar.lastError }}</p>

      <div class="mb-row mb-fam-add">
        <button class="mb-btn" @click="addFamiliar">＋手動新增一隻</button>
        <button v-if="familiar.list.length" class="mb-btn" @click="familiar.clear()">
          全部刪除
        </button>
      </div>

      <p class="mb-hint">
        數值由「同步裝備」一起撈回來，是<b>實際生效的值</b>而不是詞條表上的滿值 ——
        正常情況下你不需要在這裡輸入任何數字，只要指定誰上場。 重新同步會用遊戲當下的狀態<b>取代</b>
        同步來的那批，手動新增的會留著。
      </p>
      <p class="mb-hint">
        萌獸之間的終傷是<b>相加</b>的，加完才乘進總傷害 —— 遊戲內「最終傷害」的提示框就是
        這樣寫的，實測也吻合（兩條 +8% 顯示成萌獸 16.00%，不是 16.64%）。
      </p>
      <p class="mb-hint">
        只有<b>終傷、攻擊力%、屬性%</b>會進戰鬥力公式；加持時間、爆擊機率、無視防禦、中毒暈眩那些
        不在公式裡，選了也不會影響數字（下拉選單已經分成兩組）。
      </p>
      <p class="mb-hint">
        召喚中只能一隻、羈絆最多 {{ MAX_BOND_SLOTS }} 格。要比較「換一隻差多少」， 到「裝備變更」
        點萌獸那一格。萌獸不隨裝備組切換，五組共用同一批。
      </p>
    </section>
  </div>
</template>

<style scoped>
.mb-fam-page {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 0 24px;
}

.mb-fam-check {
  margin: 0 0 8px;
}

.mb-fam-total {
  margin: 0 0 2px;
  font-size: 12px;
}

.mb-fam-section {
  margin: 10px 0 4px;
  font-size: 12px;
}

.mb-fam {
  margin-bottom: 8px;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
}

.mb-fam-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.mb-fam-slot {
  width: 84px;
  flex: 0 0 auto;
}

.mb-fam-cat {
  padding: 1px 5px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-size: 11px;
  opacity: 0.75;
  white-space: nowrap;
}

.mb-fam-line {
  display: grid;
  grid-template-columns: 1fr 84px;
  gap: 6px;
  margin-top: 4px;
}

.mb-fam-value {
  text-align: right;
}

.mb-fam-filter {
  gap: 6px;
  margin-bottom: 6px;
}

.mb-fam-catsel {
  width: 150px;
  flex: 0 0 auto;
}

/* 沒上場的用密列表：一百多隻，每隻一張卡會完全找不到東西 */
.mb-fam-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.mb-fam-list li {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) minmax(0, 2fr) auto;
  align-items: center;
  gap: 8px;
  padding: 3px 4px;
  border-bottom: 1px solid var(--border-color);
}

.mb-fam-listname {
  display: flex;
  align-items: center;
  gap: 5px;
}

.mb-fam-listlines {
  overflow: hidden;
  font-size: 11px;
  opacity: 0.75;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mb-fam-listact {
  display: flex;
  gap: 4px;
}

.mb-fam-add {
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}
</style>
