<script setup lang="ts">
// 裝備庫頁：瀏覽與選擇「基底」裝備。
//
// 基底 = 白底基本數值，不含星力／卷軸／星火／潛能。製作器會以選中的基底
// 為起點往上疊加強化。庫由同步裝備組時自動收錄，不需手動輸入。
import { computed, ref } from 'vue'
import { useItemLibraryStore, type BaseItem } from '../stores/itemLibrary'

const store = useItemLibraryStore()

const keyword = ref('')
const partFilter = ref('')

const filtered = computed(() => {
  const kw = keyword.value.trim()
  return store.all.filter((item) => {
    if (partFilter.value && item.part !== partFilter.value) return false
    if (kw && !item.name.includes(kw) && !item.sets.some((s) => s.includes(kw))) return false
    return true
  })
})

/** 只顯示有數值的欄位，避免一整排 0 */
const STAT_LABELS: ReadonlyArray<[keyof BaseItem['base'], string]> = [
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
  ['damage', '傷害'],
]

function statLines(item: BaseItem): { label: string; value: string }[] {
  return STAT_LABELS.filter(([key]) => Number(item.base[key] ?? 0) !== 0).map(([key, label]) => ({
    label,
    value: String(item.base[key]),
  }))
}

/** 一行摘要，用於清單列 */
function summary(item: BaseItem): string {
  const lines = statLines(item)
  if (!lines.length) return '無基本數值'
  return lines
    .slice(0, 4)
    .map((l) => `${l.label} ${l.value}`)
    .join(' · ')
}
</script>

<template>
  <div class="mb-lib">
    <section class="mb-card">
      <h3 class="mb-card-title">
        裝備庫
        <span class="mb-badge">{{ store.count }} 件基底</span>
      </h3>
      <p v-if="store.lastError" class="mb-error">{{ store.lastError }}</p>

      <div v-if="!store.count" class="mb-empty">
        還沒有任何基底。到「裝備組」同步一次，穿在身上的裝備會自動收錄進來。
      </div>

      <template v-else>
        <div class="mb-row">
          <input v-model="keyword" class="mb-input mb-input--grow" placeholder="搜尋名稱或套裝" />
          <select v-model="partFilter" class="mb-input">
            <option value="">全部部位</option>
            <option v-for="part in store.parts" :key="part" :value="part">{{ part }}</option>
          </select>
        </div>
        <p class="mb-hint">
          基底只含白底基本數值，不含星力、卷軸、星火與潛能 —— 那些由製作器另外疊加。
        </p>
      </template>
    </section>

    <section v-if="store.count" class="mb-card mb-list-card">
      <ul class="mb-list">
        <li
          v-for="item in filtered"
          :key="item.name"
          class="mb-item"
          :class="{ active: item.name === store.selectedName }"
          @click="store.select(item.name)"
        >
          <img v-if="item.icon" class="mb-thumb" :src="item.icon" alt="" loading="lazy" />
          <span v-else class="mb-thumb mb-thumb--empty"></span>
          <span class="mb-item-part">{{ item.part }}</span>
          <span class="mb-item-main">
            <b>{{ item.name }}</b>
            <small>Lv.{{ item.level }} · {{ summary(item) }}</small>
          </span>
          <span v-if="item.sets.length" class="mb-item-set">{{ item.sets.join('、') }}</span>
        </li>
      </ul>
      <p v-if="!filtered.length" class="mb-empty">沒有符合條件的基底。</p>
    </section>

    <!-- 選中的基底 -->
    <section v-if="store.selected" class="mb-card">
      <h3 class="mb-card-title">
        {{ store.selected.name }}
        <span class="mb-badge">
          {{ store.selected.part }} · Lv.{{ store.selected.level }}
          <template v-if="store.selected.sets.length">
            · {{ store.selected.sets.join('、') }}
          </template>
        </span>
      </h3>
      <div class="mb-stat-grid">
        <div v-for="line in statLines(store.selected)" :key="line.label" class="mb-stat">
          <span class="mb-stat-name">{{ line.label }}</span>
          <span class="mb-stat-value">{{ line.value }}</span>
        </div>
      </div>
      <div class="mb-row mb-actions">
        <button
          class="mb-btn"
          v-if="store.selected.source !== 'bundled'"
          @click="store.remove(store.selected.name)"
        >
          從庫中移除
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.mb-lib {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 0 24px;
}

.mb-actions {
  margin-top: 8px;
}

.mb-list-card {
  max-height: 46vh;
  overflow-y: auto;
}

.mb-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

/* 圖示是 CDN 網址，清單有五百多列，交給瀏覽器 lazy load */
.mb-thumb {
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  object-fit: contain;
  image-rendering: pixelated;
}

.mb-thumb--empty {
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.06);
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
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mb-item-main small {
  overflow: hidden;
  font-size: 10px;
  opacity: 0.6;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mb-item-set {
  flex-shrink: 0;
  font-size: 10px;
  opacity: 0.55;
}

.mb-stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 4px 10px;
}

.mb-stat {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 3px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 12px;
}

.mb-stat-name {
  opacity: 0.7;
}

.mb-stat-value {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
</style>
