<script setup lang="ts">
// 萌獸：照遊戲的結構 —— 一隻萌獸三條詞條，一次召喚一隻，另外有羈絆欄位。
//
// 為什麼獨立成一個分頁而不是掛在製作台裡：
//   製作台的流程是「挑底 → 疊卷軸／星力／潛能／追加」，萌獸沒有基底可挑，
//   詞條是直接給的，塞在那條流程尾巴上只會讓兩邊都難找。
//
// 為什麼數值要玩家自己填：詞條表上的是滿值，實際數字隨階級不同
//   （傳說的暗黑半人馬是魔攻 +14%，表上寫 +20%）。階級係數沒有公開資料，
//   猜一個係數不如照抄遊戲畫面 —— 那本來就是精確的。
//
// 實際的替換在「裝備變更」頁做，這裡只負責建檔與編輯。

import { computed } from 'vue'
import {
  FAMILIAR_GRADES,
  LINES_PER_FAMILIAR,
  MAX_BOND_SLOTS,
  useFamiliarStore,
  type Familiar,
  type FamiliarGrade,
  type FamiliarSlot,
} from '../stores/familiar'
import { FAMILIAR_LINE_GROUPS } from '../data/familiarLines'

const familiar = useFamiliarStore()

const SLOT_OPTIONS: ReadonlyArray<{ value: FamiliarSlot; label: string }> = [
  { value: null, label: '沒上場' },
  { value: 'summon', label: '召喚中' },
  { value: 'bond', label: '羈絆' },
]

const totals = computed(() => familiar.current)

function onName(id: string, event: Event): void {
  familiar.update(id, { name: (event.target as HTMLInputElement).value })
}

function onGrade(id: string, event: Event): void {
  familiar.update(id, { grade: (event.target as HTMLSelectElement).value as FamiliarGrade })
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
  familiar.add({ name: '', grade: '傳說' })
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
        <button v-if="familiar.list.length" type="button" class="mb-link" @click="familiar.clear()">
          全部刪除
        </button>
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

      <div v-for="item in familiar.list" :key="item.id" class="mb-fam" :class="{ off: !item.slot }">
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
          <select
            class="mb-input mb-fam-grade"
            :value="item.grade"
            @change="onGrade(item.id, $event)"
          >
            <option v-for="grade in FAMILIAR_GRADES" :key="grade" :value="grade">
              {{ grade }}
            </option>
          </select>
          <input
            class="mb-input mb-input--grow"
            placeholder="萌獸名稱（例：暗黑半人馬）"
            :value="item.name"
            @input="onName(item.id, $event)"
          />
          <button class="mb-btn mb-btn--sm" @click="familiar.remove(item.id)">刪除</button>
        </div>

        <div v-for="index in LINES_PER_FAMILIAR" :key="index" class="mb-fam-line">
          <select
            class="mb-input"
            :value="item.lines[index - 1].name"
            @change="onLineName(item.id, index - 1, $event)"
          >
            <option value="">第 {{ index }} 條（空白）</option>
            <optgroup v-for="group in FAMILIAR_LINE_GROUPS" :key="group.label" :label="group.label">
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

      <p v-if="!familiar.list.length" class="mb-hint">還沒有任何萌獸。用下面的按鈕加一隻。</p>

      <div class="mb-row mb-fam-add">
        <button class="mb-btn" @click="addFamiliar">＋新增一隻萌獸</button>
      </div>

      <p v-if="familiar.lastError" class="mb-error">{{ familiar.lastError }}</p>
      <p class="mb-hint">
        每隻固定<b>三條詞條</b>，而且<b>可以重複</b>（巡邏機器人就有兩條都是加持技能持續時間）。
        數值請照遊戲畫面填 —— 同一條詞條的數字會隨萌獸階級不同，表上的是滿值。
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
        召喚中只能一隻、羈絆最多 {{ MAX_BOND_SLOTS }} 格。要比較「換一隻差多少」，
        到「裝備變更」點萌獸那一格。萌獸不隨裝備組切換，五組共用同一批。
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

/* 一隻一張小卡，卸下的仍然看得到但要一眼分得出沒在生效 */
.mb-fam {
  margin-bottom: 8px;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
}

.mb-fam.off {
  opacity: 0.5;
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

.mb-fam-grade {
  width: 72px;
  flex: 0 0 auto;
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

.mb-fam-add {
  flex-wrap: wrap;
  gap: 4px;
}
</style>
