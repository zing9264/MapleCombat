<script setup lang="ts">
// 角色快照頁：從 NEXON Open API 擷取角色狀態，檢視裝備與能力值，並保留歷史快照。
//
// API 回傳的是遊戲內當下的顯示值，且只反映目前啟用的裝備 preset。
// 每組 preset 各擷取並保存一份快照，快照即是此工具的 preset。
import { computed, ref } from 'vue'
import {
  fetchCharacter,
  getApiKey,
  setApiKey,
  type FetchProgress,
  type EquipmentItem,
} from '../services/nexonApi'
import { useSnapshotsStore } from '../stores/snapshots'

const store = useSnapshotsStore()

const apiKeyInput = ref(getApiKey())
const apiKeySaved = ref(Boolean(getApiKey()))
const characterName = ref(localStorage.getItem('mbLastCharacterName') || '')
const loading = ref(false)
const progress = ref<FetchProgress | null>(null)
const errorMessage = ref('')
const expandedSlot = ref('')

const maskedKey = computed(() => {
  const key = getApiKey()
  if (!key) return ''
  return `${key.slice(0, 8)}${'•'.repeat(12)}${key.slice(-4)}`
})

function onSaveKey(): void {
  setApiKey(apiKeyInput.value)
  apiKeySaved.value = Boolean(getApiKey())
  errorMessage.value = ''
}

function onClearKey(): void {
  setApiKey('')
  apiKeyInput.value = ''
  apiKeySaved.value = false
}

async function onFetch(): Promise<void> {
  const name = characterName.value.trim()
  if (!name || loading.value) return

  loading.value = true
  errorMessage.value = ''
  progress.value = null
  try {
    const raw = await fetchCharacter(name, (p) => (progress.value = p))
    store.add(raw)
    localStorage.setItem('mbLastCharacterName', name)
  } catch (error) {
    errorMessage.value = (error as Error).message
  } finally {
    loading.value = false
    progress.value = null
  }
}

function onPin(id: string): void {
  const label = window.prompt('替這份快照命名（可留空）', '')
  if (label === null) return
  store.pin(id, label)
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 從 final_stat 取值 */
function stat(name: string): string {
  return store.active?.stat.find((s) => s.stat_name === name)?.stat_value ?? '—'
}

const headlineStats = [
  '戰鬥力',
  '傷害',
  'BOSS怪物傷害',
  '最終傷害',
  '爆擊傷害',
  '無視防禦率',
  '一般怪物傷害',
  '攻擊力',
  '魔法攻擊力',
  '星力',
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
  for (const symbol of store.active?.symbols ?? []) {
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
  <div class="mb-snapshot">
    <!-- API Key 設定 -->
    <section class="mb-card">
      <h3 class="mb-card-title">NEXON Open API</h3>
      <div v-if="!apiKeySaved" class="mb-key-setup">
        <p class="mb-hint">
          需要自己的 API Key：到
          <span class="mb-code">openapi.nexon.com</span>
          登入後，My Applications → 註冊應用程式 → 選 MapleStory (TW) → 開發階段。
        </p>
        <div class="mb-row">
          <input
            v-model="apiKeyInput"
            type="password"
            class="mb-input mb-input--grow"
            placeholder="貼上 API Key"
            autocomplete="off"
          />
          <button class="mb-btn mb-btn--primary" @click="onSaveKey">儲存</button>
        </div>
      </div>
      <div v-else class="mb-row">
        <span class="mb-key-mask">{{ maskedKey }}</span>
        <button class="mb-btn" @click="onClearKey">清除</button>
      </div>
    </section>

    <!-- 擷取 -->
    <section class="mb-card">
      <h3 class="mb-card-title">擷取角色</h3>
      <div class="mb-row">
        <input
          v-model="characterName"
          class="mb-input mb-input--grow"
          placeholder="角色名稱"
          :disabled="!apiKeySaved || loading"
          @keyup.enter="onFetch"
        />
        <button
          class="mb-btn mb-btn--primary"
          :disabled="!apiKeySaved || loading || !characterName.trim()"
          @click="onFetch"
        >
          {{ loading ? '擷取中…' : '擷取' }}
        </button>
      </div>
      <p v-if="progress" class="mb-hint">
        ({{ progress.step }}/{{ progress.total }}) {{ progress.label }}
      </p>
      <p v-if="errorMessage" class="mb-error">{{ errorMessage }}</p>
      <p v-if="store.lastError" class="mb-error">{{ store.lastError }}</p>
      <p class="mb-hint">
        API 回傳的是遊戲內當下的顯示值（含寵物、活動、師徒），且只看得到目前啟用的裝備 preset。切換
        preset 後可再擷取一份。
      </p>
    </section>

    <!-- 快照清單 -->
    <section v-if="store.snapshots.length" class="mb-card">
      <h3 class="mb-card-title">
        快照
        <span class="mb-badge">自動保留 {{ store.MAX_AUTO_SNAPSHOTS }} 份</span>
      </h3>
      <ul class="mb-snap-list">
        <li
          v-for="snap in store.snapshots"
          :key="snap.id"
          class="mb-snap"
          :class="{ active: snap.id === store.activeId }"
          @click="store.setActive(snap.id)"
        >
          <span class="mb-snap-pin" :class="{ on: snap.pinned }">{{
            snap.pinned ? '★' : '☆'
          }}</span>
          <span class="mb-snap-main">
            <b>{{ snap.label || snap.characterName }}</b>
            <small>Lv.{{ snap.level }} {{ snap.job }} · {{ formatTime(snap.fetchedAt) }}</small>
          </span>
          <span class="mb-snap-actions">
            <button v-if="!snap.pinned" class="mb-btn mb-btn--sm" @click.stop="onPin(snap.id)">
              保存
            </button>
            <button v-else class="mb-btn mb-btn--sm" @click.stop="store.unpin(snap.id)">
              取消保存
            </button>
            <button class="mb-btn mb-btn--sm" @click.stop="store.remove(snap.id)">刪除</button>
          </span>
        </li>
      </ul>
    </section>

    <template v-if="store.active">
      <!-- 角色與能力值 -->
      <section class="mb-card">
        <h3 class="mb-card-title">
          {{ store.active.characterName }}
          <span class="mb-badge">
            Lv.{{ store.active.level }} {{ store.active.job }} · {{ store.active.worldName }}
            <template v-if="store.active.guildName"> · {{ store.active.guildName }}</template>
          </span>
        </h3>
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
          <span class="mb-badge">{{ store.active.equipment.length }} 件</span>
        </h3>
        <ul class="mb-equip-list">
          <li
            v-for="item in store.active.equipment"
            :key="item.item_equipment_slot"
            class="mb-equip"
          >
            <button class="mb-equip-head" @click="toggleSlot(item.item_equipment_slot)">
              <span class="mb-equip-part">{{ item.item_equipment_part }}</span>
              <span class="mb-equip-name">{{ item.item_name }}</span>
              <span v-if="Number(item.starforce)" class="mb-equip-star">
                ★{{ item.starforce }}
              </span>
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
  </div>
</template>

<style scoped>
.mb-snapshot {
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

.mb-input {
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--outline, rgba(255, 255, 255, 0.18));
  border-radius: 6px;
  background: var(--surface-0, rgba(0, 0, 0, 0.18));
  color: inherit;
  font-size: 12px;
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
  cursor: pointer;
  white-space: nowrap;
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

.mb-code {
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.1);
  font-family: ui-monospace, monospace;
}

.mb-error {
  margin: 6px 0 0;
  font-size: 12px;
  color: #ff8080;
}

.mb-key-mask {
  flex: 1;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  opacity: 0.75;
}

/* 快照清單 */
.mb-snap-list,
.mb-equip-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.mb-snap {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 6px;
  border-radius: 6px;
  cursor: pointer;
}

.mb-snap:hover {
  background: rgba(255, 255, 255, 0.05);
}

.mb-snap.active {
  background: rgba(255, 255, 255, 0.1);
}

.mb-snap-pin {
  opacity: 0.35;
}

.mb-snap-pin.on {
  opacity: 1;
  color: #ffc857;
}

.mb-snap-main {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
}

.mb-snap-main b {
  font-size: 12px;
}

.mb-snap-main small {
  font-size: 10px;
  opacity: 0.6;
}

.mb-snap-actions {
  display: flex;
  gap: 4px;
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
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

/* 裝備 */
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
  opacity: 0.6;
  font-size: 11px;
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
  opacity: 0.55;
  font-size: 11px;
}

.mb-equip-line {
  font-size: 11px;
  opacity: 0.9;
}
</style>
