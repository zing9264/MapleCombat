<script setup lang="ts">
// 製作台：從裝備庫挑一個底，往上疊四層強化，存進物品欄。
//
// 四層對應 API 的四個欄位（實測逐數字吻合）：
//   白 base ＝ item_base_option、紫 etc ＝ 卷軸、黃 starforce ＝ 星力、藍綠 add ＝ 星火
// 成品資料與 API 抓下來的裝備同形，換裝比較引擎不需區分真實／自製。
import { computed, reactive, ref } from 'vue'
import { useItemLibraryStore, type BaseItem } from '../stores/itemLibrary'
import { normalizeLayer, useInventoryStore, type AppliedScroll } from '../stores/inventory'
import { expectedOption, getScroll, scrollCategoryOf, scrollsFor } from '../data/scrolls'
import {
  computeStarforce,
  gearKindOf,
  inferItemJob,
  jobCategoryFromMainStat,
  maxStarFor,
  partGainsMaxHp,
  type NumericOption,
} from '../core/starforce'
import {
  FLAME_TYPE_LABELS,
  MAX_FLAME_LINES,
  flameValue,
  sumFlames,
  supportsFlameType,
  type FlameContext,
  type FlameGrade,
  type FlameLine,
} from '../core/flame'
import { useEquipmentSetsStore } from '../stores/equipmentSets'
import { getJobStatLabelsByName } from '@/data/jobs'

const library = useItemLibraryStore()
const inventory = useInventoryStore()
const sets = useEquipmentSetsStore()

/** 星力的主副屬性依角色職業而定；沒有同步過的話預設戰士 */
const jobCategory = computed(() =>
  jobCategoryFromMainStat(getJobStatLabelsByName(sets.active?.data?.job ?? '').main),
)

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
  flames.splice(0)
  starCount.value = 0
  bossReward.value = false
  itemName.value = ''
  potentials.splice(0, 3, '', '', '')
  additionalPotentials.splice(0, 3, '', '', '')
}

/** 部位是不是武器 —— 卷軸分類已經判斷過，直接沿用 */
const isWeaponPart = computed(
  () =>
    base.value !== null &&
    scrollCategoryOf(base.value.part) === '武器' &&
    base.value.part !== '機器心臟',
)

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

// ── 星力層 ──────────────────────────────────────────
const starCount = ref(0)
const maxStar = computed(() => (base.value ? maxStarFor(base.value.level) : 0))

const numericBase = computed<NumericOption>(() => {
  const b = base.value?.base
  const n = (v: unknown) => Number(v ?? 0)
  return b
    ? {
        str: n(b.str),
        dex: n(b.dex),
        int: n(b.int),
        luk: n(b.luk),
        attackPower: n(b.attack_power),
        magicPower: n(b.magic_power),
        armor: n(b.armor),
        maxHp: n(b.max_hp),
        maxMp: n(b.max_mp),
      }
    : {}
})

const starforce = computed<NumericOption>(() => {
  if (!base.value || starCount.value <= 0) return {}
  return computeStarforce({
    reqLevel: base.value.level,
    star: starCount.value,
    job: inferItemJob(base.value.part, jobCategory.value),
    kind: gearKindOf(base.value.part, isWeaponPart.value),
    gainsMaxHp: partGainsMaxHp(base.value.part),
    base: numericBase.value,
    // 卷軸層是底線命名，星力計算讀駝峰；不轉的話武器 15 星以下會讀不到卷軸魔攻
    upgrade: normalizeLayer(etc.value),
  })
})

// ── 星火層 ──────────────────────────────────────────
const flames = reactive<FlameLine[]>([])
const bossReward = ref(false)

const flameCtx = computed<FlameContext>(() => ({
  reqLevel: base.value?.level ?? 0,
  isWeapon: isWeaponPart.value,
  bossReward: bossReward.value,
  baseAttackPower: Number(base.value?.base.attack_power ?? 0),
  baseMagicPower: Number(base.value?.base.magic_power ?? 0),
}))

const flameTypeOptions = computed(() =>
  FLAME_TYPE_LABELS.filter(([type]) => supportsFlameType(type, flameCtx.value)),
)

const add = computed<NumericOption>(() => sumFlames(flames, flameCtx.value))

function addFlame(): void {
  if (flames.length >= MAX_FLAME_LINES) return
  flames.push({ type: 'int', grade: 1 })
}

function removeFlame(index: number): void {
  flames.splice(index, 1)
}

function flamePreview(line: FlameLine): number {
  return flameValue(line.type, line.grade, flameCtx.value)
}

const FLAME_GRADES: FlameGrade[] = [1, 2, 3, 4, 5, 6, 7]

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
  star: number
  etc: number
  add: number
}

/** 星力／星火用駝峰命名，對照到 API 的底線命名 */
const CAMEL_KEY: Record<string, keyof NumericOption> = {
  str: 'str',
  dex: 'dex',
  int: 'int',
  luk: 'luk',
  max_hp: 'maxHp',
  max_mp: 'maxMp',
  attack_power: 'attackPower',
  magic_power: 'magicPower',
  armor: 'armor',
}

/** 仿遊戲 tooltip：合計（白 +黃 +紫 +藍綠） */
const preview = computed<PreviewRow[]>(() => {
  if (!base.value) return []
  return STAT_LABELS.map(([key, label]) => {
    const camel = CAMEL_KEY[key]
    const b = Number(base.value?.base[key as keyof BaseItem['base']] ?? 0)
    const e = etc.value[key] ?? 0
    const st = camel ? (starforce.value[camel] ?? 0) : 0
    const ad = camel ? (add.value[camel] ?? 0) : (add.value[key as keyof NumericOption] ?? 0)
    return { label, base: b, star: st, etc: e, add: ad, total: fmt(b + e + st + ad) }
  }).filter((row) => row.base || row.etc || row.star || row.add)
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
    starforce: { ...starforce.value } as Record<string, number>,
    add: { ...add.value } as Record<string, number>,
    scrolls: scrolls.map((s) => ({ ...s })),
    starCount: starCount.value,
    flameTier: flames.reduce((max, f) => Math.max(max, f.grade), 0),
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

      <!-- 3. 星力 -->
      <section class="mb-card">
        <h3 class="mb-card-title">
          3. 星力
          <span class="mb-badge"
            >上限 {{ maxStar }} 星 · 職業 {{ sets.active?.data?.job ?? '未同步' }}</span
          >
        </h3>
        <div class="mb-row">
          <input v-model.number="starCount" type="range" min="0" :max="maxStar" class="mb-range" />
          <span class="mb-star-value">★ {{ starCount }}</span>
        </div>
        <p class="mb-hint">
          飾品與機器心臟是共用裝，四項屬性從 1 星就全加；防具武器只加該職業的主副屬性，其餘 16
          星後才加。
        </p>
      </section>

      <!-- 4. 星火 -->
      <section class="mb-card">
        <h3 class="mb-card-title">
          4. 星火
          <span class="mb-badge">{{ flames.length }} / {{ MAX_FLAME_LINES }} 條</span>
        </h3>
        <label v-if="isWeaponPart" class="mb-check">
          <input v-model="bossReward" type="checkbox" />
          <span>BOSS 掉落武器（攻擊力星火係數完全不同）</span>
        </label>
        <ul v-if="flames.length" class="mb-flame-list">
          <li v-for="(line, i) in flames" :key="i" class="mb-flame">
            <select v-model="line.type" class="mb-input mb-input--grow">
              <option v-for="[type, label] in flameTypeOptions" :key="type" :value="type">
                {{ label }}
              </option>
            </select>
            <select v-model.number="line.grade" class="mb-input">
              <option v-for="g in FLAME_GRADES" :key="g" :value="g">{{ g }} 階</option>
            </select>
            <span class="mb-flame-value">+{{ flamePreview(line) }}</span>
            <button class="mb-btn mb-btn--sm" @click="removeFlame(i)">移除</button>
          </li>
        </ul>
        <div class="mb-row mb-flame-add">
          <button class="mb-btn" :disabled="flames.length >= MAX_FLAME_LINES" @click="addFlame">
            新增一條星火
          </button>
        </div>
      </section>

      <!-- 4. 潛能 -->
      <section class="mb-card">
        <h3 class="mb-card-title">5. 潛能</h3>
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
              <span v-if="row.star" class="c-star"> +{{ fmt(row.star) }}</span>
              <span v-if="row.etc" class="c-etc"> +{{ fmt(row.etc) }}</span>
              <span v-if="row.add" class="c-add"> +{{ fmt(row.add) }}</span
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

.mb-range {
  flex: 1;
  min-width: 0;
}

.mb-star-value {
  width: 56px;
  color: #ffc857;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.mb-check {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 12px;
  cursor: pointer;
}

.mb-flame-list {
  margin: 0 0 6px;
  padding: 0;
  list-style: none;
}

.mb-flame {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
}

.mb-flame select {
  /* 上游全域樣式會把 select 設成 width:100%，兩個下拉互搶寬度，這裡明確指定 */
  width: auto;
}

.mb-flame select:first-child {
  flex: 1 1 auto;
  min-width: 120px;
}

.mb-flame select:nth-child(2) {
  flex: 0 0 72px;
  width: 72px;
}

.mb-flame-value {
  width: 52px;
  color: #7fe0d0;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.mb-flame-add {
  margin-top: 4px;
}
</style>
