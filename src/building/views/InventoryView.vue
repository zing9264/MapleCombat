<script setup lang="ts">
// 物品欄：製作台做出來的自製裝備。全域、跨裝備組共用。
import { computed } from 'vue'
import { normalizeLayer, useInventoryStore, type CraftedItem } from '../stores/inventory'
import type { NumericOption } from '../core/starforce'
import { getScroll } from '../data/scrolls'

const store = useInventoryStore()

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

interface Row {
  label: string
  total: string
  base: number
  etc: number
  starforce: number
  add: number
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

function layers(item: CraftedItem) {
  return {
    base: normalizeLayer(item.base as Record<string, unknown>),
    etc: normalizeLayer(item.etc),
    starforce: normalizeLayer(item.starforce),
    add: normalizeLayer(item.add),
  }
}

function rows(item: CraftedItem): Row[] {
  const l = layers(item)
  return STAT_LABELS.map(([key, label]) => {
    const base = l.base[key] ?? 0
    const etc = l.etc[key] ?? 0
    const starforce = l.starforce[key] ?? 0
    const add = l.add[key] ?? 0
    return { label, base, etc, starforce, add, total: fmt(base + etc + starforce + add) }
  }).filter((r) => r.base || r.etc || r.starforce || r.add)
}

const selectedRows = computed(() => (store.selected ? rows(store.selected) : []))

function summary(item: CraftedItem): string {
  const l = layers(item)
  const total = (key: keyof NumericOption) =>
    Math.round((l.base[key] ?? 0) + (l.etc[key] ?? 0) + (l.starforce[key] ?? 0) + (l.add[key] ?? 0))
  const magic = total('magicPower')
  const int = total('int')
  const bits = []
  if (item.starCount) bits.push(`★${item.starCount}`)
  if (int) bits.push(`INT ${int}`)
  if (magic) bits.push(`魔攻 ${magic}`)
  if (item.scrolls.length) bits.push(`卷軸 ${item.scrolls.reduce((n, s) => n + s.count, 0)} 張`)
  return bits.join(' · ') || '無數值'
}

function onRename(id: string): void {
  const target = store.items.find((i) => i.id === id)
  const name = window.prompt('物品名稱', target?.name ?? '')
  if (name === null) return
  store.rename(id, name)
}

function onRemove(id: string): void {
  const target = store.items.find((i) => i.id === id)
  if (target && window.confirm(`刪除「${target.name}」？`)) store.remove(id)
}
</script>

<template>
  <div class="mb-inv">
    <section class="mb-card">
      <h3 class="mb-card-title">
        物品欄 <span class="mb-badge">{{ store.count }} 件自製裝備</span>
      </h3>
      <p v-if="store.lastError" class="mb-error">{{ store.lastError }}</p>
      <div v-if="!store.count" class="mb-empty">
        還沒有自製裝備。到「製作台」從裝備庫挑一個底做一件。
      </div>
      <ul v-else class="mb-list">
        <li
          v-for="item in store.items"
          :key="item.id"
          class="mb-item"
          :class="{ active: item.id === store.selectedId }"
          @click="store.select(item.id)"
        >
          <span class="mb-item-part">{{ item.part }}</span>
          <span class="mb-item-main">
            <b>{{ item.name }}</b>
            <small>{{ item.baseName }} · Lv.{{ item.level }} · {{ summary(item) }}</small>
          </span>
          <span class="mb-item-actions">
            <button class="mb-btn mb-btn--sm" @click.stop="onRename(item.id)">命名</button>
            <button class="mb-btn mb-btn--sm" @click.stop="onRemove(item.id)">刪除</button>
          </span>
        </li>
      </ul>
    </section>

    <section v-if="store.selected" class="mb-card">
      <h3 class="mb-card-title">
        {{ store.selected.name }}
        <span class="mb-badge">
          {{ store.selected.part }} · Lv.{{ store.selected.level }}
          <template v-if="store.selected.sets.length">
            · {{ store.selected.sets.join('、') }}</template
          >
        </span>
      </h3>

      <div class="mb-tip">
        <div v-for="r in selectedRows" :key="r.label" class="mb-tip-row">
          <span class="mb-tip-label">{{ r.label }}</span>
          <span class="mb-tip-total">+{{ r.total }}</span>
          <span class="mb-tip-parts">
            (<span class="c-base">{{ r.base }}</span>
            <span v-if="r.starforce" class="c-star"> +{{ fmt(r.starforce) }}</span>
            <span v-if="r.etc" class="c-etc"> +{{ fmt(r.etc) }}</span>
            <span v-if="r.add" class="c-add"> +{{ fmt(r.add) }}</span
            >)
          </span>
        </div>
      </div>

      <div v-if="store.selected.scrolls.length" class="mb-section">
        <span class="mb-section-label">卷軸</span>
        <span v-for="s in store.selected.scrolls" :key="s.scrollId" class="mb-line">
          {{ getScroll(s.scrollId)?.name ?? s.scrollId }} × {{ s.count }}
        </span>
      </div>
      <div v-if="store.selected.potentials.length" class="mb-section">
        <span class="mb-section-label">潛在能力</span>
        <span v-for="(line, i) in store.selected.potentials" :key="i" class="mb-line">{{
          line
        }}</span>
      </div>
      <div v-if="store.selected.additionalPotentials.length" class="mb-section">
        <span class="mb-section-label">附加潛在能力</span>
        <span v-for="(line, i) in store.selected.additionalPotentials" :key="i" class="mb-line">
          {{ line }}
        </span>
      </div>
      <p class="mb-hint">
        顏色比照遊戲：<span class="c-base">白＝基底</span>、<span class="c-star">黃＝星力</span
        >、<span class="c-etc">紫＝卷軸</span>、<span class="c-add">藍綠＝星火</span>
      </p>
    </section>
  </div>
</template>

<style scoped>
.mb-inv {
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
  padding: 8px 0;
  font-size: 12px;
  text-align: center;
  opacity: 0.7;
}

.mb-error {
  margin: 6px 0 0;
  font-size: 12px;
  color: #ff8080;
}

.mb-hint {
  margin: 8px 0 0;
  font-size: 11px;
  opacity: 0.65;
}

.mb-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.mb-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 6px;
  border-radius: 6px;
  cursor: pointer;
}

.mb-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.mb-item.active {
  background: rgba(255, 255, 255, 0.12);
}

.mb-item-part {
  width: 78px;
  flex-shrink: 0;
  font-size: 11px;
  opacity: 0.6;
}

.mb-item-main {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
}

.mb-item-main b {
  font-size: 12px;
}

.mb-item-main small {
  overflow: hidden;
  font-size: 10px;
  opacity: 0.6;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mb-item-actions {
  display: flex;
  gap: 4px;
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

.mb-btn--sm {
  height: 22px;
  padding: 0 7px;
  font-size: 11px;
}

.mb-tip {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-family: ui-monospace, monospace;
  font-size: 12px;
}

.mb-tip-row {
  display: flex;
  gap: 8px;
}

.mb-tip-label {
  width: 80px;
  opacity: 0.8;
}

.mb-tip-total {
  width: 60px;
  font-weight: 700;
}

.mb-section {
  display: flex;
  flex-wrap: wrap;
  gap: 3px 10px;
  margin-top: 8px;
  font-size: 11px;
}

.mb-section-label {
  width: 80px;
  opacity: 0.55;
}

.mb-line {
  opacity: 0.9;
}

.c-base {
  color: #fff;
}

.c-star {
  color: #ffc857;
}

.c-etc {
  color: #c9a3ff;
}

.c-add {
  color: #7fe0d0;
}
</style>
