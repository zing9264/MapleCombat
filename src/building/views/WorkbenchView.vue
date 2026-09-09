<script setup lang="ts">
// 製作台：從裝備庫挑一個底，往上疊四層強化，存進物品欄。
//
// 四層對應 API 的四個欄位（實測逐數字吻合）：
//   白 base ＝ item_base_option、紫 etc ＝ 卷軸、黃 starforce ＝ 星力、藍綠 add ＝ 星火
// 成品資料與 API 抓下來的裝備同形，換裝比較引擎不需區分真實／自製。
import { computed, reactive, ref } from 'vue'
import { useItemLibraryStore, type BaseItem } from '../stores/itemLibrary'
import { useInventoryStore, type AppliedScroll } from '../stores/inventory'
import { expectedOption, getScroll, scrollCategoryOf, scrollsFor } from '../data/scrolls'

const library = useItemLibraryStore()
const inventory = useInventoryStore()

// ── 挑底 ────────────────────────────────────────────
const keyword = ref('')
const partFilter = ref('')
const baseName = ref('')
const base = computed<BaseItem | null>(() => library.items[baseName.value] ?? null)

const candidates = computed(() => {
  const kw = keyword.value.trim()
  return library.all.filter(
    (i) =>
      (!partFilter.value || i.part === partFilter.value) &&
      (!kw || i.name.includes(kw) || i.sets.some((s) => s.includes(kw))),
  )
})

function pickBase(name: string): void {
  baseName.value = name
  scrolls.splice(0)
  itemName.value = ''
  potentials.splice(0, 3, '', '', '')
  additionalPotentials.splice(0, 3, '', '', '')
}

// ── 卷軸層 ──────────────────────────────────────────
const scrolls = reactive<AppliedScroll[]>([])
const scrollChoice = ref('')

const scrollOptions = computed(() =>
  base.value ? scrollsFor(base.value.part, base.value.level) : [],
)
const scrollCategory = computed(() => (base.value ? scrollCategoryOf(base.value.part) : null))
const scrollSlots = computed(() => base.value?.scrollSlots ?? 0)
const scrollsUsed = computed(() => scrolls.reduce((n, s) => n + s.count, 0))
const scrollsLeft = computed(() => Math.max(0, scrollSlots.value - scrollsUsed.value))

function addScroll(): void {
  if (!scrollChoice.value || scrollsLeft.value <= 0) return
  const existing = scrolls.find((s) => s.scrollId === scrollChoice.value)
  if (existing) existing.count += 1
  else scrolls.push({ scrollId: scrollChoice.value, count: 1 })
}

function removeScroll(scrollId: string): void {
  const index = scrolls.findIndex((s) => s.scrollId === scrollId)
  if (index === -1) return
  scrolls[index].count -= 1
  if (scrolls[index].count <= 0) scrolls.splice(index, 1)
}

/** 卷軸層合計（期望值） */
const etc = computed<Record<string, number>>(() => {
  const total: Record<string, number> = {}
  for (const applied of scrolls) {
    const def = getScroll(applied.scrollId)
    if (!def) continue
    for (const [key, value] of Object.entries(expectedOption(def))) {
      total[key] = (total[key] ?? 0) + value * applied.count
    }
  }
  return total
})

const scrollCost = computed(() =>
  scrolls.reduce((sum, s) => sum + (getScroll(s.scrollId)?.referencePrice ?? 0) * s.count, 0),
)

// ── 星力／星火：資料表尚未建立，先保留欄位 ─────────────
const starCount = ref(0)
const flameTier = ref(0)

// ── 潛能 ────────────────────────────────────────────
const potentials = reactive(['', '', ''])
const additionalPotentials = reactive(['', '', ''])

// ── 成品 ────────────────────────────────────────────
const itemName = ref('')

const STAT_LABELS: ReadonlyArray<[string, string]> = [
  ['str', 'STR'],
  ['dex', 'DEX'],
  ['int', 'INT'],
  ['luk', 'LUK'],
  ['max_hp', 'MaxHP'],
  ['max_mp', 'MaxMP'],
  ['attack_power', '攻擊力'],
  ['magic_power', '魔法攻擊力'],
  ['armor', '防禦力'],
  ['boss_damage', 'BOSS傷害'],
  ['ignore_monster_armor', '無視防禦'],
  ['all_stat', '全屬性'],
]

interface PreviewRow {
  label: string
  total: string
  base: number
  etc: number
}

/** 仿遊戲 tooltip：合計（白 +紫） */
const preview = computed<PreviewRow[]>(() => {
  if (!base.value) return []
  return STAT_LABELS.map(([key, label]) => {
    const b = Number(base.value?.base[key as keyof BaseItem['base']] ?? 0)
    const e = etc.value[key] ?? 0
    return { label, base: b, etc: e, total: fmt(b + e) }
  }).filter((row) => row.base !== 0 || row.etc !== 0)
})

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

function formatMeso(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)} 億`
  if (n >= 10_000) return `${Math.round(n / 10_000)} 萬`
  return String(n)
}

function save(): void {
  if (!base.value) return
  inventory.add({
    name: itemName.value.trim() || base.value.name,
    baseName: base.value.name,
    part: base.value.part,
    level: base.value.level,
    sets: base.value.sets,
    base: base.value.base,
    etc: { ...etc.value },
    starforce: {},
    add: {},
    scrolls: scrolls.map((s) => ({ ...s })),
    starCount: starCount.value,
    flameTier: flameTier.value,
    potentials: potentials.filter(Boolean),
    additionalPotentials: additionalPotentials.filter(Boolean),
  })
  saved.value = `已存入物品欄：${itemName.value.trim() || base.value.name}`
}
const saved = ref('')
</script>

<template>
  <div class="mb-wb">
    <!-- 1. 挑底 -->
    <section class="mb-card">
      <h3 class="mb-card-title">
        1. 從裝備庫挑一個底
        <span class="mb-badge">{{ library.count }} 件可選</span>
      </h3>
      <div v-if="!library.count" class="mb-empty">裝備庫是空的。先到「裝備組」同步一次。</div>
      <template v-else>
        <div class="mb-row">
          <input v-model="keyword" class="mb-input mb-input--grow" placeholder="搜尋名稱或套裝" />
          <select v-model="partFilter" class="mb-input">
            <option value="">全部部位</option>
            <option v-for="part in library.parts" :key="part" :value="part">{{ part }}</option>
          </select>
        </div>
        <ul class="mb-pick-list">
          <li
            v-for="item in candidates"
            :key="item.name"
            class="mb-pick"
            :class="{ active: item.name === baseName }"
            @click="pickBase(item.name)"
          >
            <span class="mb-pick-part">{{ item.part }}</span>
            <span class="mb-pick-name">{{ item.name }}</span>
            <small>Lv.{{ item.level }} · 卷軸 {{ item.scrollSlots }} 格</small>
          </li>
        </ul>
      </template>
    </section>

    <template v-if="base">
      <!-- 2. 卷軸 -->
      <section class="mb-card">
        <h3 class="mb-card-title">
          2. 卷軸
          <span class="mb-badge">
            {{ scrollCategory ?? '此部位無法上卷' }} · 已用 {{ scrollsUsed }} / {{ scrollSlots }} 格
          </span>
        </h3>
        <p v-if="!scrollSlots" class="mb-hint">
          這個基底沒有卷軸格數資料（舊版收錄）。到「裝備組」重新同步一次就會補上。
        </p>
        <p v-else-if="!scrollOptions.length" class="mb-hint">
          還沒有「{{ scrollCategory }}」類別的卷軸資料，等截圖補表。
        </p>
        <template v-else>
          <div class="mb-row">
            <select v-model="scrollChoice" class="mb-input mb-input--grow">
              <option value="">選擇卷軸</option>
              <option v-for="s in scrollOptions" :key="s.id" :value="s.id">
                {{ s.name }}
                <template v-if="s.referencePrice"
                  >（約 {{ formatMeso(s.referencePrice) }}）</template
                >
              </option>
            </select>
            <button
              class="mb-btn mb-btn--primary"
              :disabled="!scrollChoice || scrollsLeft <= 0"
              @click="addScroll"
            >
              +1 張
            </button>
          </div>
          <ul v-if="scrolls.length" class="mb-scroll-list">
            <li v-for="s in scrolls" :key="s.scrollId" class="mb-scroll">
              <span class="mb-scroll-name">{{ getScroll(s.scrollId)?.name }}</span>
              <span class="mb-scroll-count">× {{ s.count }}</span>
              <button class="mb-btn mb-btn--sm" @click="removeScroll(s.scrollId)">−1</button>
            </li>
          </ul>
          <p class="mb-hint">
            隨機卷（命運／星彩／救世）以期望值計算；卷軸參考價合計約
            <b>{{ formatMeso(scrollCost) }}</b> 楓幣。
          </p>
        </template>
      </section>

      <!-- 3. 星力／星火（待建表） -->
      <section class="mb-card">
        <h3 class="mb-card-title">3. 星力與星火 <span class="mb-badge">資料表建置中</span></h3>
        <div class="mb-row">
          <label class="mb-field">
            <span>星力</span>
            <input
              v-model.number="starCount"
              type="number"
              min="0"
              max="30"
              class="mb-input"
              disabled
            />
          </label>
          <label class="mb-field">
            <span>星火階級</span>
            <input
              v-model.number="flameTier"
              type="number"
              min="0"
              max="7"
              class="mb-input"
              disabled
            />
          </label>
        </div>
        <p class="mb-hint">
          星力依「裝備等級 × 星數」查表、星火依「等級 × 階級」公式，表建好後這兩格會自動算。
        </p>
      </section>

      <!-- 4. 潛能 -->
      <section class="mb-card">
        <h3 class="mb-card-title">4. 潛能</h3>
        <div class="mb-pot-grid">
          <div class="mb-pot-col">
            <span class="mb-pot-label">潛在能力</span>
            <input
              v-for="(_, i) in potentials"
              :key="'p' + i"
              v-model="potentials[i]"
              class="mb-input"
              :placeholder="`第 ${i + 1} 行，例：INT +13%`"
            />
          </div>
          <div class="mb-pot-col">
            <span class="mb-pot-label">附加潛在能力</span>
            <input
              v-for="(_, i) in additionalPotentials"
              :key="'a' + i"
              v-model="additionalPotentials[i]"
              class="mb-input"
              :placeholder="`第 ${i + 1} 行，例：魔法攻擊力 +12`"
            />
          </div>
        </div>
        <p class="mb-hint">格式跟遊戲 tooltip 一樣即可，解析器會處理。之後會接方塊模擬。</p>
      </section>

      <!-- 預覽與存檔 -->
      <section class="mb-card">
        <h3 class="mb-card-title">
          {{ base.name }}
          <span class="mb-badge">{{ base.part }} · Lv.{{ base.level }}</span>
        </h3>
        <div class="mb-preview">
          <div v-for="row in preview" :key="row.label" class="mb-preview-row">
            <span class="mb-preview-label">{{ row.label }}</span>
            <span class="mb-preview-total">+{{ row.total }}</span>
            <span class="mb-preview-parts">
              (<span class="c-base">{{ row.base }}</span>
              <span v-if="row.etc" class="c-etc"> +{{ fmt(row.etc) }}</span
              >)
            </span>
          </div>
        </div>
        <div class="mb-row mb-save-row">
          <input
            v-model="itemName"
            class="mb-input mb-input--grow"
            :placeholder="`名稱（預設：${base.name}）`"
          />
          <button class="mb-btn mb-btn--primary" @click="save">存入物品欄</button>
        </div>
        <p v-if="saved" class="mb-hint">{{ saved }}</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.mb-wb {
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

.mb-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.mb-save-row {
  margin-top: 8px;
}

.mb-field {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.mb-field .mb-input {
  width: 72px;
}

.mb-input {
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--outline, rgba(255, 255, 255, 0.18));
  border-radius: 6px;
  background: var(--surface-0, rgba(0, 0, 0, 0.18));
  color: inherit;
  font-size: 12px;
}

.mb-input:disabled {
  opacity: 0.45;
}

.mb-input--grow {
  flex: 1;
  min-width: 0;
}

.mb-btn {
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--outline, rgba(255, 255, 255, 0.18));
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
}

.mb-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
}

.mb-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.mb-btn--primary {
  border-color: transparent;
  background: var(--accent, #6c8cff);
  color: #fff;
}

.mb-btn--sm {
  height: 22px;
  padding: 0 7px;
  font-size: 11px;
}

.mb-hint {
  margin: 6px 0 0;
  font-size: 11px;
  line-height: 1.5;
  opacity: 0.65;
}

.mb-empty {
  padding: 8px 0;
  font-size: 12px;
  text-align: center;
  opacity: 0.7;
}

.mb-pick-list {
  max-height: 32vh;
  margin: 6px 0 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.mb-pick {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}

.mb-pick:hover {
  background: rgba(255, 255, 255, 0.05);
}

.mb-pick.active {
  background: rgba(255, 255, 255, 0.12);
}

.mb-pick-part {
  width: 78px;
  flex-shrink: 0;
  font-size: 11px;
  opacity: 0.6;
}

.mb-pick-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mb-pick small {
  font-size: 10px;
  opacity: 0.6;
}

.mb-scroll-list {
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
}

.mb-scroll {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  font-size: 12px;
}

.mb-scroll-name {
  flex: 1;
}

.mb-scroll-count {
  font-variant-numeric: tabular-nums;
}

.mb-pot-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.mb-pot-col {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mb-pot-label {
  font-size: 11px;
  opacity: 0.7;
}

/* 仿遊戲 tooltip：合計 (白 +紫 +黃 +藍綠) */
.mb-preview {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-family: ui-monospace, monospace;
  font-size: 12px;
}

.mb-preview-row {
  display: flex;
  gap: 8px;
}

.mb-preview-label {
  width: 80px;
  opacity: 0.8;
}

.mb-preview-total {
  width: 60px;
  font-weight: 700;
}

.mb-preview-parts {
  opacity: 0.85;
}

.c-base {
  color: #fff;
}

.c-etc {
  color: #c9a3ff;
}
</style>
