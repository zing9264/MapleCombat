<script setup lang="ts">
// 裝備欄格子：照遊戲裝備視窗的排列顯示穿戴中的裝備，滑過顯示遊戲格式的 tooltip。
//
// 同一部位有多格時（戒指 4 格、墜飾 2 格、圖騰 3 格）依 API 回傳順序填入。
// 武器與副武器用「歸類」比對而非部位名稱，否則其他職業的武器會漏掉。
import { computed, ref } from 'vue'
import { EQUIP_GRID, SECONDARY_PARTS, isWeaponPart } from '../data/equipSlots'
import type { EquipmentItem, PetInfo } from '../services/nexonApi'
import { normalizeLayer } from '../core/gearAdapters'
import type { NumericOption } from '../core/starforce'

interface Entry {
  item: EquipmentItem
  index: number
}

const props = defineProps<{
  equipment: readonly EquipmentItem[]
  pets: readonly PetInfo[]
  /** 目前選取的裝備在 equipment 裡的位置；用位置而非名稱，身上可能有同名戒指 */
  selectedIndex?: number | null
  /** 被替換／被拔掉的位置，用來標記格子 */
  states?: Readonly<Record<number, 'replaced' | 'removed'>>
  /** 萌獸摘要。不是 API 的裝備，所以獨立傳進來而不是混在 equipment 裡 */
  familiar?: { total: number; count: number }
}>()

const emit = defineEmits<{ (e: 'select', index: number): void }>()

const hovered = ref<Entry | null>(null)

/** 把裝備依格子分派好；同部位多格時照 API 順序 */
const layout = computed(() => {
  const pools = new Map<string, Entry[]>()
  const push = (key: string, entry: Entry) => {
    const pool = pools.get(key)
    if (pool) pool.push(entry)
    else pools.set(key, [entry])
  }

  props.equipment.forEach((item, index) => {
    const partName = item.item_equipment_part
    if (SECONDARY_PARTS.has(partName)) push('secondary', { item, index })
    else if (isWeaponPart(partName)) push('weapon', { item, index })
    else push(partName, { item, index })
  })

  const taken = new Map<string, number>()
  const placed = new Set<number>()

  const rows = EQUIP_GRID.map((row) =>
    row.map((cell) => {
      if (!cell) return null
      // 這幾種不是 API 裝備，不從 pools 取用，也不佔用同部位的順序
      if (cell.kind === 'pet' || cell.kind === 'petItem' || cell.kind === 'familiar') {
        return { cell, entry: null }
      }
      const key = cell.kind === 'part' ? (cell.part ?? '') : cell.kind
      const pool = pools.get(key) ?? []
      const used = taken.get(key) ?? 0
      taken.set(key, used + 1)
      const entry = pool[used] ?? null
      if (entry) placed.add(entry.index)
      return { cell, entry }
    }),
  )

  // 沒排進格子的裝備（新部位、或同部位件數超過格子數）一律另外列出。
  // 少顯示一件就可能讓玩家漏看一件裝備，不能靜默吞掉。
  const overflow = props.equipment
    .map((item, index): Entry => ({ item, index }))
    .filter((entry) => !placed.has(entry.index))

  return { rows, overflow }
})

/** 寵物與寵物裝備依序填進最後兩列 */
const petAt = (column: number) => props.pets[column] ?? null

function iconOf(item: EquipmentItem): string {
  return (item as EquipmentItem & { item_icon?: string }).item_icon ?? ''
}

function starOf(item: EquipmentItem): number {
  return Number(item.starforce ?? 0)
}

function onPick(entry: Entry | null): void {
  if (entry) emit('select', entry.index)
}

// ── Tooltip ────────────────────────────────────────
const STAT_LABELS: ReadonlyArray<[keyof NumericOption, string]> = [
  ['str', 'STR'],
  ['dex', 'DEX'],
  ['int', 'INT'],
  ['luk', 'LUK'],
  ['maxHp', 'MaxHP'],
  ['maxMp', 'MaxMP'],
  ['attackPower', '攻擊力'],
  ['magicPower', '魔法攻擊力'],
  ['armor', '防禦力'],
  ['bossDamage', 'BOSS傷害'],
  ['ignoreDefense', '無視防禦'],
  ['allStat', '全屬性'],
]

interface TooltipRow {
  label: string
  total: number
  base: number
  star: number
  etc: number
  add: number
}

/** 比照遊戲 tooltip：合計（白 +黃 +紫 +藍綠） */
const tooltipRows = computed<TooltipRow[]>(() => {
  const item = hovered.value?.item
  if (!item) return []
  const base = normalizeLayer(item.item_base_option)
  const star = normalizeLayer(item.item_starforce_option)
  const etc = normalizeLayer(item.item_etc_option)
  const add = normalizeLayer(item.item_add_option)

  return STAT_LABELS.map(([key, label]) => ({
    label,
    base: base[key] ?? 0,
    star: star[key] ?? 0,
    etc: etc[key] ?? 0,
    add: add[key] ?? 0,
    total: (base[key] ?? 0) + (star[key] ?? 0) + (etc[key] ?? 0) + (add[key] ?? 0),
  })).filter((row) => row.total !== 0)
})

const tooltipPotentials = computed(() => {
  const item = hovered.value?.item
  if (!item) return { grade: '', lines: [] as string[], addGrade: '', addLines: [] as string[] }
  return {
    grade: item.potential_option_grade ?? '',
    lines: [item.potential_option_1, item.potential_option_2, item.potential_option_3].filter(
      (line): line is string => Boolean(line),
    ),
    addGrade: item.additional_potential_option_grade ?? '',
    addLines: [
      item.additional_potential_option_1,
      item.additional_potential_option_2,
      item.additional_potential_option_3,
    ].filter((line): line is string => Boolean(line)),
  }
})
</script>

<template>
  <div class="mb-grid-wrap">
    <div class="mb-grid">
      <div v-for="(row, r) in layout.rows" :key="r" class="mb-grid-row">
        <template v-for="(cell, c) in row" :key="c">
          <div v-if="!cell" class="mb-cell mb-cell--gap" />

          <!-- 寵物與寵物裝備 -->
          <div
            v-else-if="cell.cell.kind === 'pet'"
            class="mb-cell"
            :class="{ empty: !petAt(c) }"
            :title="petAt(c)?.name ?? cell.cell.label"
          >
            <span class="mb-cell-label">{{ petAt(c)?.name ?? cell.cell.label }}</span>
          </div>
          <div
            v-else-if="cell.cell.kind === 'petItem'"
            class="mb-cell"
            :class="{ empty: !petAt(c)?.itemName }"
            :title="petAt(c)?.itemName ?? cell.cell.label"
          >
            <span class="mb-cell-label">{{ petAt(c)?.itemName ?? cell.cell.label }}</span>
          </div>

          <!-- 萌獸：顯示合計終傷，內容在製作台編輯 -->
          <div
            v-else-if="cell.cell.kind === 'familiar'"
            class="mb-cell"
            :class="{ empty: !familiar?.count }"
            :title="
              familiar?.count
                ? `萌獸 ${familiar.count} 條 · 合計最終傷害 ${familiar.total}%`
                : '萌獸（到製作台新增）'
            "
          >
            <span v-if="familiar?.count" class="mb-cell-fam">
              <b>{{ familiar.total }}%</b>
              <small>萌獸 {{ familiar.count }}</small>
            </span>
            <span v-else class="mb-cell-label">{{ cell.cell.label }}</span>
          </div>

          <!-- 一般裝備 -->
          <div
            v-else
            class="mb-cell"
            :class="[
              {
                empty: !cell.entry,
                active: cell.entry && cell.entry.index === selectedIndex,
              },
              cell.entry && states ? states[cell.entry.index] : '',
            ]"
            @click="onPick(cell.entry)"
            @mouseenter="hovered = cell.entry"
            @mouseleave="hovered = null"
          >
            <template v-if="cell.entry">
              <img v-if="iconOf(cell.entry.item)" :src="iconOf(cell.entry.item)" alt="" />
              <span v-else class="mb-cell-label">{{ cell.entry.item.item_name }}</span>
              <span v-if="starOf(cell.entry.item)" class="mb-cell-star">
                ★{{ starOf(cell.entry.item) }}
              </span>
            </template>
            <span v-else class="mb-cell-label">{{ cell.cell.label }}</span>
          </div>
        </template>
      </div>
    </div>

    <!-- 沒有對應格子的裝備 -->
    <div v-if="layout.overflow.length" class="mb-overflow">
      <span class="mb-overflow-head">沒有對應格子</span>
      <div class="mb-grid-row">
        <div
          v-for="entry in layout.overflow"
          :key="entry.index"
          class="mb-cell"
          :class="{ active: entry.index === selectedIndex }"
          :title="`${entry.item.item_equipment_part} · ${entry.item.item_name}`"
          @click="onPick(entry)"
          @mouseenter="hovered = entry"
          @mouseleave="hovered = null"
        >
          <img v-if="iconOf(entry.item)" :src="iconOf(entry.item)" alt="" />
          <span v-else class="mb-cell-label">{{ entry.item.item_name }}</span>
          <span v-if="starOf(entry.item)" class="mb-cell-star">★{{ starOf(entry.item) }}</span>
        </div>
      </div>
    </div>

    <!-- 遊戲格式的 tooltip -->
    <div v-if="hovered" class="mb-tip">
      <div class="mb-tip-name">{{ hovered.item.item_name }}</div>
      <div class="mb-tip-sub">
        {{ hovered.item.item_equipment_part }}
        <template v-if="starOf(hovered.item)"> · ★{{ starOf(hovered.item) }}</template>
      </div>
      <div v-for="row in tooltipRows" :key="row.label" class="mb-tip-row">
        <span class="mb-tip-label">{{ row.label }}</span>
        <span class="mb-tip-total">+{{ row.total }}</span>
        <span class="mb-tip-parts">
          (<span class="c-base">{{ row.base }}</span>
          <span v-if="row.star" class="c-star"> +{{ row.star }}</span>
          <span v-if="row.etc" class="c-etc"> +{{ row.etc }}</span>
          <span v-if="row.add" class="c-add"> +{{ row.add }}</span
          >)
        </span>
      </div>
      <div v-if="tooltipPotentials.lines.length" class="mb-tip-pot">
        <div class="mb-tip-pot-head">潛在能力：{{ tooltipPotentials.grade }}</div>
        <div v-for="(line, i) in tooltipPotentials.lines" :key="i">{{ line }}</div>
      </div>
      <div v-if="tooltipPotentials.addLines.length" class="mb-tip-pot">
        <div class="mb-tip-pot-head">附加潛能：{{ tooltipPotentials.addGrade }}</div>
        <div v-for="(line, i) in tooltipPotentials.addLines" :key="i">{{ line }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mb-grid-wrap {
  position: relative;
}

.mb-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: fit-content;
}

.mb-grid-row {
  display: flex;
  gap: 4px;
}

.mb-cell {
  position: relative;
  display: flex;
  width: 46px;
  height: 46px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--outline, rgba(255, 255, 255, 0.16));
  border-radius: 6px;
  background: var(--surface-0, rgba(0, 0, 0, 0.2));
  cursor: pointer;
  overflow: hidden;
}

.mb-cell--gap {
  border: 0;
  background: transparent;
  cursor: default;
}

.mb-cell.empty {
  border-style: dashed;
  opacity: 0.45;
  cursor: default;
}

.mb-cell:not(.empty):not(.mb-cell--gap):hover {
  border-color: var(--accent, #6c8cff);
}

.mb-cell.active {
  border-color: var(--accent, #6c8cff);
  box-shadow: 0 0 0 1px var(--accent, #6c8cff) inset;
}

.mb-cell img {
  max-width: 36px;
  max-height: 36px;
  image-rendering: pixelated;
}

.mb-cell-label {
  padding: 2px;
  font-size: 9px;
  line-height: 1.15;
  text-align: center;
  opacity: 0.75;
  word-break: break-all;
}

.mb-cell-star {
  position: absolute;
  top: 1px;
  left: 2px;
  color: #ffc857;
  font-size: 9px;
  text-shadow: 0 0 2px #000;
}

.mb-cell-fam {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  line-height: 1.1;
}

.mb-cell-fam b {
  color: #7fe0d0;
  font-size: 12px;
}

.mb-cell-fam small {
  font-size: 8px;
  opacity: 0.7;
}

/* 替換草稿的標記 */
.mb-cell.replaced {
  border-color: #7fe0a0;
  box-shadow: 0 0 0 1px #7fe0a0 inset;
}

.mb-cell.removed {
  border-color: #ff9090;
  border-style: dashed;
  opacity: 0.5;
}

.mb-cell.replaced::after,
.mb-cell.removed::after {
  position: absolute;
  right: 2px;
  bottom: 1px;
  font-size: 9px;
  line-height: 1;
}

.mb-cell.replaced::after {
  content: '換';
  color: #7fe0a0;
}

.mb-cell.removed::after {
  content: '拔';
  color: #ff9090;
}

.mb-overflow {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px dashed rgba(255, 255, 255, 0.16);
}

.mb-overflow-head {
  display: block;
  margin-bottom: 4px;
  font-size: 10px;
  color: #ffc857;
}

/* tooltip */
.mb-tip {
  position: absolute;
  top: 0;
  left: calc(100% + 8px);
  z-index: 20;
  min-width: 210px;
  max-width: 280px;
  padding: 8px 10px;
  border: 1px solid var(--outline, rgba(255, 255, 255, 0.2));
  border-radius: 8px;
  background: rgba(18, 18, 26, 0.97);
  color: #fff;
  font-size: 11px;
  pointer-events: none;
}

.mb-tip-name {
  font-size: 12px;
  font-weight: 700;
}

.mb-tip-sub {
  margin-bottom: 6px;
  font-size: 10px;
  opacity: 0.6;
}

.mb-tip-row {
  display: flex;
  gap: 6px;
  font-variant-numeric: tabular-nums;
}

.mb-tip-label {
  width: 64px;
  opacity: 0.75;
}

.mb-tip-total {
  width: 48px;
  font-weight: 700;
  text-align: right;
}

.mb-tip-parts {
  opacity: 0.85;
}

.mb-tip-pot {
  margin-top: 6px;
  padding-top: 5px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  line-height: 1.5;
}

.mb-tip-pot-head {
  opacity: 0.6;
}
</style>
