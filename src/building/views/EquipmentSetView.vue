<script setup lang="ts">
// 裝備組頁：對應遊戲內的裝備 preset，Set 1~5 固定槽位。
//
// 與上游「狀態 1~5」的分工：狀態是調 buff 用的，裝備組是換裝用的，兩者正交。
// 一次比較應該只動其中一軸。
//
// API 只回傳當下啟用的 preset，因此流程是：遊戲切到某組 → 按該槽的「同步」。
import { computed, ref } from 'vue'
import { fetchCharacter, type EquipmentItem, type FetchProgress } from '../services/nexonApi'
import { useEquipmentSetsStore, type SetSlotId } from '../stores/equipmentSets'
import { useItemLibraryStore } from '../stores/itemLibrary'
import { useApiKeyStore } from '../stores/apiKey'
import { useDialog } from '../composables/useDialog'
import MbDialog from '../components/MbDialog.vue'

const dialog = useDialog()
const store = useEquipmentSetsStore()
const library = useItemLibraryStore()
const apiKey = useApiKeyStore()
const absorbedCount = ref(0)

const characterName = ref(localStorage.getItem('mbLastCharacterName') || '')
const syncing = ref(false)
const progress = ref<FetchProgress | null>(null)
const errorMessage = ref('')
const expandedSlot = ref('')

const canSync = computed(
  () => apiKey.hasKey && !syncing.value && Boolean(characterName.value.trim()),
)

/** 戰鬥力照遊戲的寫法斷成億／萬 */
function formatPower(value: string): string {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return '（空）'
  const yi = Math.floor(n / 100000000)
  const wan = Math.floor((n % 100000000) / 10000)
  const rest = n % 10000
  if (yi) return `${yi}億${wan}萬${rest}`
  if (wan) return `${wan}萬${rest}`
  return String(rest)
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * 同步：擷取遊戲當下狀態，覆蓋指定槽位。
 *
 * 刻意先擷取、再跳確認並列出戰鬥力變化 —— API 不會告訴我們遊戲裡現在啟用的是
 * 哪一組 preset，玩家很容易人在「刷怪」卻按了「打王」的同步，一鍵蓋掉正確資料。
 */
async function onSync(id: SetSlotId): Promise<void> {
  const name = characterName.value.trim()
  if (!name || syncing.value) return

  syncing.value = true
  errorMessage.value = ''
  try {
    const raw = await fetchCharacter(name, (p) => (progress.value = p))
    const target = store.sets.find((s) => s.id === id)
    const after = raw.stat.final_stat.find((s) => s.stat_name === '戰鬥力')?.stat_value ?? ''

    if (target?.data) {
      const confirmed = await dialog.confirm({
        title: `以遊戲當下狀態覆蓋「${target.name}」？`,
        lines: [
          `戰鬥力 ${formatPower(store.statOf(id, '戰鬥力'))} → ${formatPower(after)}`,
          `上次同步 ${formatTime(target.data.fetchedAt)}`,
          '請先確認遊戲內已切到這一組裝備 preset。',
        ],
        confirmLabel: '覆蓋',
        danger: true,
      })
      if (!confirmed) return
    }
    store.syncInto(id, raw)
    // 同步順便把基底收進裝備庫（全域，跨裝備組共用）
    absorbedCount.value = library.absorb(raw.equipment)
  } catch (error) {
    errorMessage.value = (error as Error).message
  } finally {
    syncing.value = false
    progress.value = null
    localStorage.setItem('mbLastCharacterName', name)
  }
}

async function onRename(id: SetSlotId): Promise<void> {
  const target = store.sets.find((s) => s.id === id)
  if (!target) return
  const name = await dialog.prompt({
    title: '裝備組名稱',
    lines: ['例如：打王、刷怪、簡窩'],
    initial: target.name,
    maxLength: 12,
  })
  if (name === null) return
  store.rename(id, name)
}

async function onClear(id: SetSlotId): Promise<void> {
  const target = store.sets.find((s) => s.id === id)
  if (!target?.data) return
  const confirmed = await dialog.confirm({
    title: `清除「${target.name}」的資料？`,
    lines: ['同步下來的裝備與能力值都會消失，替換草稿也會一併清掉。'],
    confirmLabel: '清除',
    danger: true,
  })
  if (confirmed) store.clear(id)
}

/** 從 final_stat 取值 */
function stat(name: string): string {
  return store.active?.data?.stat.find((s) => s.stat_name === name)?.stat_value ?? '—'
}

const headlineStats = [
  '傷害',
  'BOSS怪物傷害',
  '最終傷害',
  '爆擊傷害',
  '無視防禦率',
  '一般怪物傷害',
  '攻擊力',
  '魔法攻擊力',
  '星力',
  '神秘力量',
]

function potentials(item: EquipmentItem): string[] {
  return [item.potential_option_1, item.potential_option_2, item.potential_option_3].filter(
    (v): v is string => Boolean(v),
  )
}

function additionalPotentials(item: EquipmentItem): string[] {
  return [
    item.additional_potential_option_1,
    item.additional_potential_option_2,
    item.additional_potential_option_3,
  ].filter((v): v is string => Boolean(v))
}

function toggleSlot(slot: string): void {
  expandedSlot.value = expandedSlot.value === slot ? '' : slot
}

const symbolTotals = computed(() => {
  const groups: Record<string, { count: number; stat: number; force: number }> = {}
  for (const symbol of store.active?.data?.symbols ?? []) {
    const kind = symbol.symbol_name.split('：')[0]
    const bucket = (groups[kind] ??= { count: 0, stat: 0, force: 0 })
    bucket.count += 1
    bucket.stat +=
      Number(symbol.symbol_int || 0) +
      Number(symbol.symbol_str || 0) +
      Number(symbol.symbol_dex || 0) +
      Number(symbol.symbol_luk || 0)
    bucket.force += Number(symbol.symbol_force || 0)
  }
  return Object.entries(groups)
})
</script>

<template>
  <div class="mb-sets">
    <MbDialog :controller="dialog" />

    <!-- 裝備組槽位 -->
    <div class="mb-set-tabs" aria-label="裝備組切換">
      <button
        v-for="item in store.sets"
        :key="item.id"
        type="button"
        class="mb-set-tab"
        :class="{ active: item.id === store.activeId, empty: !item.data }"
        @click="store.setActive(item.id)"
      >
        <span class="mb-set-tab-name">{{ item.name }}</span>
        <small>{{ item.data ? formatPower(store.statOf(item.id, '戰鬥力')) : '未同步' }}</small>
      </button>
    </div>

    <!-- 目前槽位的操作 -->
    <section class="mb-card">
      <div class="mb-row">
        <input
          v-model="characterName"
          class="mb-input mb-input--grow"
          placeholder="角色名稱"
          :disabled="!apiKey.hasKey || syncing"
          @keyup.enter="onSync(store.activeId)"
        />
        <button class="mb-btn mb-btn--primary" :disabled="!canSync" @click="onSync(store.activeId)">
          {{ syncing ? '同步中…' : `同步到「${store.active?.name}」` }}
        </button>
        <button class="mb-btn" @click="onRename(store.activeId)">命名</button>
        <button class="mb-btn" :disabled="!store.active?.data" @click="onClear(store.activeId)">
          清除
        </button>
      </div>
      <p v-if="!apiKey.hasKey" class="mb-error">尚未設定 API Key，請到右上「管理」貼上。</p>
      <p v-if="progress" class="mb-hint">
        ({{ progress.step }}/{{ progress.total }}) {{ progress.label }}
      </p>
      <p v-if="absorbedCount" class="mb-hint">已收錄 {{ absorbedCount }} 件新基底到裝備庫。</p>
      <p v-if="errorMessage" class="mb-error">{{ errorMessage }}</p>
      <p v-if="store.lastError" class="mb-error">{{ store.lastError }}</p>
      <p class="mb-hint">
        API 只讀得到遊戲內<b>當下啟用</b>的裝備 preset。請先在遊戲裡切到要記錄的那一組，再按同步。
        擷取到的數值等同屬性視窗顯示值，寵物、活動與師徒加成都已含在內。
      </p>
    </section>

    <template v-if="store.active?.data">
      <!-- 角色與能力值 -->
      <section class="mb-card">
        <h3 class="mb-card-title">
          {{ store.active.data.characterName }}
          <span class="mb-badge">
            Lv.{{ store.active.data.level }} {{ store.active.data.job }} ·
            {{ store.active.data.worldName }} · 同步於 {{ formatTime(store.active.data.fetchedAt) }}
          </span>
        </h3>
        <div class="mb-power">
          <span class="mb-power-label">戰鬥力</span>
          <span class="mb-power-value">{{ formatPower(stat('戰鬥力')) }}</span>
        </div>
        <div class="mb-stat-grid">
          <div v-for="name in headlineStats" :key="name" class="mb-stat">
            <span class="mb-stat-name">{{ name }}</span>
            <span class="mb-stat-value">{{ stat(name) }}</span>
          </div>
        </div>
      </section>

      <!-- 符文 -->
      <section v-if="symbolTotals.length" class="mb-card">
        <h3 class="mb-card-title">符文</h3>
        <div class="mb-stat-grid">
          <div v-for="[kind, total] in symbolTotals" :key="kind" class="mb-stat">
            <span class="mb-stat-name">{{ kind }}（{{ total.count }}）</span>
            <span class="mb-stat-value">主屬 {{ total.stat }} · 力量 {{ total.force }}</span>
          </div>
        </div>
      </section>

      <!-- 裝備 -->
      <section class="mb-card">
        <h3 class="mb-card-title">
          裝備
          <span class="mb-badge">{{ store.active.data.equipment.length }} 件</span>
        </h3>
        <ul class="mb-equip-list">
          <li
            v-for="item in store.active.data.equipment"
            :key="item.item_equipment_slot"
            class="mb-equip"
          >
            <button class="mb-equip-head" @click="toggleSlot(item.item_equipment_slot)">
              <span class="mb-equip-part">{{ item.item_equipment_part }}</span>
              <span class="mb-equip-name">{{ item.item_name }}</span>
              <span v-if="Number(item.starforce)" class="mb-equip-star">★{{ item.starforce }}</span>
              <span
                v-if="item.potential_option_grade"
                class="mb-equip-grade"
                :data-grade="item.potential_option_grade"
              >
                {{ item.potential_option_grade }}
              </span>
            </button>
            <div v-if="expandedSlot === item.item_equipment_slot" class="mb-equip-body">
              <div v-if="potentials(item).length" class="mb-equip-section">
                <span class="mb-equip-label">潛能</span>
                <span v-for="(line, i) in potentials(item)" :key="i" class="mb-equip-line">
                  {{ line }}
                </span>
              </div>
              <div v-if="additionalPotentials(item).length" class="mb-equip-section">
                <span class="mb-equip-label">附加潛能</span>
                <span
                  v-for="(line, i) in additionalPotentials(item)"
                  :key="i"
                  class="mb-equip-line"
                >
                  {{ line }}
                </span>
              </div>
              <div class="mb-equip-section">
                <span class="mb-equip-label">卷軸</span>
                <span class="mb-equip-line">
                  升級 {{ item.scroll_upgrade }} 次 · 剩餘可切 {{ item.cuttable_count }} 次
                  <template v-if="item.golden_hammer_flag === '適用'"> · 已用黃金鎚</template>
                </span>
              </div>
              <div v-if="item.soul_name" class="mb-equip-section">
                <span class="mb-equip-label">魂</span>
                <span class="mb-equip-line">{{ item.soul_name }} · {{ item.soul_option }}</span>
              </div>
            </div>
          </li>
        </ul>
      </section>
    </template>

    <section v-else class="mb-card mb-empty">
      「{{ store.active?.name }}」還沒有資料。在遊戲裡切到這組裝備，然後按上面的同步。
    </section>
  </div>
</template>

<style scoped>
.mb-sets {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 0 24px;
}

/* 裝備組槽位 */

.mb-code {
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.1);
  font-family: ui-monospace, monospace;
}

.mb-key-mask {
  flex: 1;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  opacity: 0.75;
}

/* 戰鬥力 */
.mb-power {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding-bottom: 6px;
  margin-bottom: 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.mb-power-label {
  font-size: 12px;
  opacity: 0.7;
}

.mb-power-value {
  font-size: 16px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* 能力值 */
.mb-stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
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

/* 裝備 */
.mb-equip-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.mb-equip + .mb-equip {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.mb-equip-head {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  padding: 5px 4px;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.mb-equip-head:hover {
  background: rgba(255, 255, 255, 0.05);
}

.mb-equip-part {
  width: 76px;
  flex-shrink: 0;
  font-size: 11px;
  opacity: 0.6;
}

.mb-equip-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mb-equip-star {
  color: #ffc857;
  font-size: 11px;
}

.mb-equip-grade {
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.12);
  font-size: 10px;
}

.mb-equip-grade[data-grade='傳說'] {
  background: rgba(160, 230, 60, 0.25);
}

.mb-equip-grade[data-grade='罕見'] {
  background: rgba(120, 200, 255, 0.25);
}

.mb-equip-body {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 4px 4px 8px 84px;
}

.mb-equip-section {
  display: flex;
  flex-wrap: wrap;
  gap: 3px 8px;
}

.mb-equip-label {
  width: 56px;
  flex-shrink: 0;
  font-size: 11px;
  opacity: 0.55;
}

.mb-equip-line {
  font-size: 11px;
  opacity: 0.9;
}
</style>
