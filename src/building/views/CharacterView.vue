<script setup lang="ts">
// 角色資料：顯示已同步裝備組的角色面板，版面比照 MapleKit 的角色頁。
//
// 戰鬥力刻意直接取 API 的 `戰鬥力` 欄位，不用公式重算。實測證據：
// 兩份快照的戰鬥力只差 0.13%（154,433,894 vs 154,641,206），但面板的
// 傷害 97 vs 67、BOSS 359 vs 319、爆傷 124.8 vs 86.8 差了 30～38 個百分點。
// 若戰鬥力是由面板值算出來的，兩者該差將近 40%。所以遊戲的戰鬥力不吃
// buff 後的面板值，而 API 給的那個數字本身就是對的 —— 沒有理由再推一次。
//
// 上游的戰鬥力公式仍然要用，但用在「換裝前後的差值」上：兩邊用同一套裝備
// 分解，系統性偏差會互相抵銷。那部分在裝備變更頁。
import { computed } from 'vue'
import { useEquipmentSetsStore } from '../stores/equipmentSets'
import { useFamiliarStore } from '../stores/familiar'
import { useBaseline } from '../composables/useBaseline'
import {
  DAMAGE_COLUMNS,
  DAMAGE_ROWS,
  EXTRA_TABLES,
  STAT_COLUMNS,
  STAT_ROWS,
  type BaselineFieldId,
} from '../stores/baseline'
import { WEAPON_SET_OPTIONS } from '../data/weaponSets'
import type { BaselineSource } from '../core/baseline'

/**
 * embedded：嵌在「總覽」儀表板裡。
 *
 * 同一頁上面已經有同步裝備那段的裝備組切換與角色名了，這裡再畫一次只是雜訊。
 * 只藏重複的殼，卡片內容一個都不少。
 */
withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })

const sets = useEquipmentSetsStore()
const familiar = useFamiliarStore()

const data = computed(() => sets.active?.data ?? null)

const statMap = computed(() => {
  const map = new Map<string, string>()
  for (const entry of data.value?.stat ?? []) map.set(entry.stat_name, entry.stat_value)
  return map
})

function raw(name: string): string {
  return statMap.value.get(name) ?? ''
}

/** 戰鬥力照遊戲的寫法斷成億／萬 */
function formatPower(value: string): string {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return '—'
  const yi = Math.floor(n / 100000000)
  const wan = Math.floor((n % 100000000) / 10000)
  const rest = n % 10000
  if (yi) return `${yi}億${wan}萬${rest}`
  if (wan) return `${wan}萬${rest}`
  return String(rest)
}

const power = computed(() => formatPower(raw('戰鬥力')))

function group(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString('en-US') : '—'
}

/**
 * 面板列表。第三欄是單位後綴。
 * stat_name 用 API 的原始寫法（真實之力、無視屬性耐性、獲得額外經驗值…），
 * 跟遊戲介面的用字不完全一樣，所以顯示名稱另外給。
 */
const PANEL_ROWS: ReadonlyArray<readonly [label: string, statName: string, suffix: string]> = [
  ['HP', 'HP', ''],
  ['MP', 'MP', ''],
  ['STR', 'STR', ''],
  ['DEX', 'DEX', ''],
  ['INT', 'INT', ''],
  ['LUK', 'LUK', ''],
  ['最終傷害', '最終傷害', '%'],
  ['傷害', '傷害', '%'],
  ['BOSS怪物傷害', 'BOSS怪物傷害', '%'],
  ['無視防禦率', '無視防禦率', '%'],
  ['攻擊力', '攻擊力', ''],
  ['魔法攻擊力', '魔法攻擊力', ''],
  ['爆擊機率', '爆擊機率', '%'],
  ['爆擊傷害', '爆擊傷害', '%'],
  ['星力', '星力', ''],
  ['額外獲得經驗值', '獲得額外經驗值', '%'],
  ['楓幣獲得量', '楓幣獲得量', '%'],
  ['道具掉落率', '道具掉落率', '%'],
  ['神秘力量', '神秘力量', ''],
  ['真實力量', '真實之力', ''],
  ['Buff持續時間', 'Buff持續時間', '%'],
  ['武器熟練度', '武器熟練度', '%'],
  ['一般怪物傷害', '一般怪物傷害', '%'],
  ['無視屬性抗性', '無視屬性耐性', '%'],
  ['狀態異常耐性', '狀態異常耐性', ''],
  ['狀態異常追加傷害', '狀態異常追加傷害', '%'],
  ['防禦力', '防禦力', ''],
  ['格擋', '格擋', '%'],
  ['跳躍力', '跳躍力', '%'],
  ['移動速度', '移動速度', '%'],
]

interface PanelRow {
  label: string
  value: string
}

const panelRows = computed<PanelRow[]>(() =>
  PANEL_ROWS.map(([label, statName, suffix]) => {
    const value = raw(statName)
    return {
      label,
      value: value === '' ? '—' : `${group(Number(value))}${suffix}`,
    }
  }),
)

/** 屬性攻擊力是個區間，單獨一列 */
const elementalAttack = computed(() => {
  const low = raw('最低屬性攻擊力')
  const high = raw('最高屬性攻擊力')
  if (!low || !high) return ''
  return `${group(Number(low))} ~ ${group(Number(high))}`
})

/** 攻擊速度在 API 是階段數字 */
const attackSpeed = computed(() => {
  const value = raw('攻擊速度')
  return value ? `第${value}階段` : '—'
})

/** 極限屬性：只列有點數的 */
const hyperStats = computed(() =>
  (data.value?.hyperStat ?? [])
    .filter((entry) => Number(entry.stat_level) > 0)
    .sort((a, b) => Number(b.stat_level) - Number(a.stat_level)),
)

const hyperUsed = computed(() =>
  (data.value?.hyperStat ?? []).reduce((sum, entry) => sum + Number(entry.stat_point ?? 0), 0),
)

// ── 戰鬥力基準 ────────────────────────────────────
// 解構出來才會被模板自動解包（巢狀屬性上的 ref 不會）
const {
  derived,
  checks,
  placeholders,
  weapon,
  power: calcPower,
  reconciled,
  labels,
  slots,
  store: baselineStore,
} = useBaseline()

/** 武器校正的推導結果，攤開來讓玩家看得到我們用了什麼去算 */
const weaponSummary = computed(() => {
  const d = weapon.derived.value
  if (!d.found) return null
  const r = weapon.resolved.value
  return {
    itemName: d.itemName,
    setLabel: WEAPON_SET_OPTIONS.find((o) => o.value === r.weaponSet)?.label ?? '未知系列',
    star: r.starCount,
    scroll: r.scrollAtk,
    flameAtk: d.flameAtk,
    flameLevel: r.flameLevel,
    total: r.currentWeaponAtk,
    correction: weapon.correction.value,
    unknownSet: !r.weaponSet,
  }
})

/**
 * 對帳列：面板六項，再加上「戰鬥力」自己。
 *
 * 戰鬥力那一列非加不可 —— 面板六項只驗證前三欄（基本數值／％／％未套用）
 * 重建得出面板值，技能欄不參與、傷害類也只是照抄面板，所以六項可以全綠
 * 而戰鬥力差兩成。玩家看到全綠就不會再懷疑基準，把戰鬥力擺進同一張表，
 * 「哪裡對不上」才一眼看得到。
 */
const checkRows = computed(() => {
  const rows = checks.value.map((check) => ({ ...check, pct: null as number | null }))
  const p = calcPower.value
  if (!p || !p.actual) return rows
  return [
    ...rows,
    {
      label: '戰鬥力（公式重算）',
      rebuilt: p.value,
      panel: p.actual,
      diff: p.value - p.actual,
      ok: !p.off,
      pct: p.diff,
    },
  ]
})

/**
 * 單一來源對某個欄位的貢獻，用來定位「對帳對不上」是哪一項造成的。
 * 三種分類要分開顯示 —— 混在一起就看不出是被 ％ 乘錯還是漏加。
 */
function sourceCell(source: BaselineSource, which: 'main' | 'sub' | 'attack'): string {
  const current = slots.value
  if (!current) return '—'
  const key = current[which]
  const parts: string[] = []
  const flat = source.flat[key] ?? 0
  const percent = source.percent[key] ?? 0
  const noApply = source.noApply[key] ?? 0
  if (flat) parts.push(flat.toLocaleString('en-US'))
  if (percent) parts.push(`${percent}%`)
  if (noApply) parts.push(`${noApply.toLocaleString('en-US')} 未套用`)
  return parts.join('　') || '—'
}

/** 留空時會用到的值，直接當 placeholder 顯示，不讓玩家猜 */
function placeholderFor(id: BaselineFieldId): string {
  const value = placeholders.value[id]
  return value === undefined ? '' : String(value)
}

function onGenesisFinal(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  baselineStore.setChoice('genesisFinal', value === 'on' || value === 'off' ? value : '')
}

function onBaselineInput(id: BaselineFieldId, event: Event): void {
  baselineStore.set(id, (event.target as HTMLInputElement).value)
}

function signed(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toLocaleString('en-US')}`
}
</script>

<template>
  <div class="mb-char">
    <!-- 選裝備組 -->
    <div v-if="!embedded" class="mb-set-tabs" aria-label="選擇裝備組">
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
      </button>
    </div>

    <section v-if="!data" class="mb-card mb-empty">
      還沒有同步過的裝備組。先在上面的「同步裝備」同步一次。
    </section>

    <template v-else>
      <!-- 戰鬥力 -->
      <section class="mb-card">
        <h3 class="mb-card-title">
          <template v-if="embedded">戰鬥力對帳</template>
          <template v-else>{{ data.characterName }}</template>
          <span class="mb-badge">
            Lv.{{ data.level }} {{ data.job }} · {{ data.worldName }}
            <template v-if="data.guildName"> · {{ data.guildName }}</template>
          </span>
        </h3>
        <div class="mb-power">
          <div class="mb-power-cell">
            <span class="mb-power-label">遊戲內戰鬥力</span>
            <span class="mb-power-value">{{ power }}</span>
          </div>
          <div v-if="calcPower" class="mb-power-cell">
            <span class="mb-power-label">計算機重算</span>
            <span class="mb-power-value" :class="{ 'is-off': calcPower.off }">
              {{ formatPower(String(calcPower.value)) }}
            </span>
            <span
              v-if="calcPower.diff !== null"
              class="mb-power-diff"
              :class="{ 'is-off': calcPower.off }"
            >
              {{ calcPower.diff >= 0 ? '+' : '' }}{{ (calcPower.diff * 100).toFixed(1) }}%
            </span>
          </div>
        </div>
        <p v-if="calcPower?.off" class="mb-power-warn">
          重算值和遊戲差
          {{ (Math.abs(calcPower.diff!) * 100).toFixed(1) }}%。<b>對帳相符不代表基準是對的</b>——
          對帳只驗證前三欄能不能重建出面板值，技能欄不參與。常見原因：快照是<b>開著 buff</b>
          時同步的（把提示框裡的「技能」那一行填到技能欄扣掉），或是<b>基本數值／％ 抄錯行</b>。
        </p>
        <div v-if="elementalAttack" class="mb-elem">
          <span class="mb-elem-label">屬性攻擊力</span>
          <span class="mb-elem-value">{{ elementalAttack }}</span>
        </div>
      </section>

      <!-- 面板 -->
      <section class="mb-card">
        <h3 class="mb-card-title">
          角色資料
          <span class="mb-badge">攻擊速度 {{ attackSpeed }}</span>
        </h3>
        <div class="mb-panel">
          <div v-for="row in panelRows" :key="row.label" class="mb-panel-row">
            <span class="mb-panel-label">{{ row.label }}</span>
            <span class="mb-panel-value">{{ row.value }}</span>
          </div>
        </div>
        <p class="mb-hint">
          這些是擷取當下的<b>屬性視窗顯示值</b>，身上開著的 buff 都算在內。戰鬥力則不受施放中的 buff
          影響，所以兩者未必同步。
        </p>
      </section>

      <!-- 極限屬性 -->
      <section v-if="hyperStats.length" class="mb-card">
        <h3 class="mb-card-title">
          極限屬性
          <span class="mb-badge">已用 {{ group(hyperUsed) }} 點</span>
        </h3>
        <ul class="mb-hyper">
          <li v-for="entry in hyperStats" :key="entry.stat_type">
            <span class="mb-hyper-lv">Lv.{{ entry.stat_level }}</span>
            <span class="mb-hyper-name">{{ entry.stat_type }}</span>
            <span class="mb-hyper-inc">{{ entry.stat_increase ?? '' }}</span>
          </li>
        </ul>
      </section>

      <!-- 萌獸 -->
      <section class="mb-card">
        <h3 class="mb-card-title">
          萌獸
          <span class="mb-badge">在下面的「萌獸」編輯</span>
        </h3>
        <div class="mb-fam-summary">
          <span v-if="familiar.active.length" class="mb-fam-summary-value">
            召喚 {{ familiar.summoned?.name || (familiar.summoned ? '（未命名）' : '無') }} · 羈絆
            {{ familiar.bonds.length }} 隻 · 終傷 {{ familiar.current.finalDamageTotal }}%（×{{
              familiar.current.multiplier.toFixed(4)
            }}）
            <template v-if="familiar.current.magicPowerPercent">
              · 魔攻 +{{ familiar.current.magicPowerPercent }}%
            </template>
            <template v-if="familiar.current.attackPowerPercent">
              · 物攻 +{{ familiar.current.attackPowerPercent }}%
            </template>
            <template v-if="familiar.current.allStatPercent">
              · 全屬性 +{{ familiar.current.allStatPercent }}%
            </template>
          </span>
          <span v-else class="mb-fam-summary-empty">尚未設定</span>
        </div>
      </section>

      <!-- 戰鬥力基準 -->
      <section class="mb-card">
        <h3 class="mb-card-title">
          戰鬥力基準
          <span class="mb-badge" :class="{ ok: reconciled }">
            {{ reconciled ? '對帳相符' : '尚未對上' }}
          </span>
          <button
            v-if="baselineStore.hasAny"
            type="button"
            class="mb-link"
            @click="baselineStore.clear()"
          >
            清除手填
          </button>
        </h3>

        <!-- 對帳：重建值 vs API 面板值 -->
        <div v-if="checkRows.length" class="mb-check">
          <div class="mb-check-row mb-check-row--head">
            <span></span>
            <span>重建值</span>
            <span>面板值</span>
            <span>差異</span>
          </div>
          <div
            v-for="check in checkRows"
            :key="check.label"
            class="mb-check-row"
            :class="check.ok ? 'ok' : 'bad'"
          >
            <span class="mb-check-label">{{ check.label }}</span>
            <span>{{ check.rebuilt.toLocaleString('en-US') }}</span>
            <span>{{ check.panel.toLocaleString('en-US') }}</span>
            <span>
              {{ check.ok ? '✓' : signed(check.diff)
              }}<template v-if="!check.ok && check.pct !== null">
                （{{ check.pct >= 0 ? '+' : '' }}{{ (check.pct * 100).toFixed(1) }}%）</template
              >
            </span>
          </div>
        </div>

        <!-- 各來源的貢獻：對帳對不上時用來定位是哪一項 -->
        <div class="mb-src">
          <div class="mb-src-row mb-src-row--head">
            <span>自動帶入的來源</span>
            <span>{{ labels.main }}</span>
            <span>{{ labels.sub }}</span>
            <span>攻擊力</span>
            <span>終傷</span>
          </div>
          <div v-for="source in derived.sources" :key="source.label" class="mb-src-row">
            <span class="mb-src-label">{{ source.label }}</span>
            <span>{{ sourceCell(source, 'main') }}</span>
            <span>{{ sourceCell(source, 'sub') }}</span>
            <span>{{ sourceCell(source, 'attack') }}</span>
            <span>{{ source.finalDamage ? `${source.finalDamage}%` : '—' }}</span>
          </div>
        </div>

        <p class="mb-hint">
          下面直接抄遊戲明細的<b>［套用中的數值］</b>那三個數字就好 —— 把滑鼠移到屬性視窗的
          INT／LUK／魔法攻擊力上就看得到，<b>不用自己挑行相加</b>。
          <b>留空</b>代表用上面自動推導的值；<b>傷害類留空即可</b>，面板值本身就是答案。
          <b>技能欄要填</b> —— 抄提示框［基本數值］與［% 數值］裡的「技能」那一行。
          遊戲算戰鬥力時不含技能加成，不扣會偏高。
        </p>

        <div class="mb-bl-table">
          <span></span>
          <span v-for="(col, i) in STAT_COLUMNS" :key="i" class="mb-bl-head">
            {{ col.label }}{{ col.suffix }}
          </span>
          <template v-for="row in STAT_ROWS" :key="row.title">
            <span class="mb-bl-rowlabel">{{ row.title }}</span>
            <input
              v-for="id in row.cells"
              :key="id"
              class="mb-input mb-bl-cell"
              inputmode="decimal"
              :placeholder="placeholderFor(id)"
              :value="baselineStore.input[id]"
              @input="onBaselineInput(id, $event)"
            />
          </template>
        </div>

        <div class="mb-bl-table mb-bl-table--dmg">
          <span></span>
          <span v-for="(col, i) in DAMAGE_COLUMNS" :key="i" class="mb-bl-head">
            {{ col.label }}{{ col.suffix }}
          </span>
          <template v-for="row in DAMAGE_ROWS" :key="row.title">
            <span class="mb-bl-rowlabel">{{ row.title }}</span>
            <input
              v-for="id in row.cells"
              :key="id"
              class="mb-input mb-bl-cell"
              inputmode="decimal"
              :placeholder="placeholderFor(id)"
              :value="baselineStore.input[id]"
              @input="onBaselineInput(id, $event)"
            />
          </template>
        </div>

        <div v-if="weaponSummary" class="mb-wep">
          <div class="mb-wep-line">
            <b>{{ weaponSummary.itemName }}</b>
            <span>{{ weaponSummary.setLabel }}</span>
            <span>{{ weaponSummary.star }}★</span>
            <span>卷軸 {{ weaponSummary.scroll }}</span>
            <span>星火 {{ weaponSummary.flameAtk }}（T{{ weaponSummary.flameLevel }}）</span>
            <span>總攻 {{ weaponSummary.total }}</span>
            <span class="mb-wep-corr">校正 {{ signed(weaponSummary.correction) }}</span>
          </div>
          <div class="mb-wep-line">
            <label class="mb-wep-pick">
              系列
              <select
                class="mb-input"
                :value="baselineStore.choice.weaponSet"
                @change="
                  baselineStore.setChoice('weaponSet', ($event.target as HTMLSelectElement).value)
                "
              >
                <option value="">自動（依武器名稱）</option>
                <option v-for="o in WEAPON_SET_OPTIONS" :key="o.value" :value="o.value">
                  {{ o.label }}
                </option>
              </select>
            </label>
            <label class="mb-wep-pick">
              創世 10% 終傷
              <select
                class="mb-input"
                :value="baselineStore.choice.genesisFinal"
                @change="onGenesisFinal($event)"
              >
                <option value="">自動（創世武器才算）</option>
                <option value="on">有</option>
                <option value="off">沒有</option>
              </select>
            </label>
          </div>
          <p v-if="weaponSummary.unknownSet" class="mb-warn">
            武器名稱對不上任何系列，武器校正會被跳過（戰鬥力因此偏高約 3%）。請在上面手動選系列。
          </p>
        </div>

        <div v-for="(table, ti) in EXTRA_TABLES" :key="ti" class="mb-extra">
          <div
            class="mb-bl-table"
            :style="{ gridTemplateColumns: `92px repeat(${table.columns.length}, minmax(0, 1fr))` }"
          >
            <span></span>
            <span v-for="(col, i) in table.columns" :key="i" class="mb-bl-head">
              {{ col.label }}{{ col.suffix }}
            </span>
            <template v-for="row in table.rows" :key="row.title">
              <span class="mb-bl-rowlabel">{{ row.title }}</span>
              <input
                v-for="id in row.cells"
                :key="id"
                class="mb-input mb-bl-cell"
                inputmode="decimal"
                :placeholder="placeholderFor(id)"
                :value="baselineStore.input[id]"
                @input="onBaselineInput(id, $event)"
              />
            </template>
          </div>
          <p v-if="table.hint" class="mb-extra-hint">{{ table.hint }}</p>
        </div>

        <p v-if="derived.unrecognized.length" class="mb-warn">
          有 {{ derived.unrecognized.length }} 項極限屬性看不懂而沒有計入，基準會因此少算：{{
            derived.unrecognized.join('、')
          }}
        </p>
        <p v-if="baselineStore.lastError" class="mb-warn">{{ baselineStore.lastError }}</p>

        <p class="mb-hint">
          主屬是 <b>{{ labels.main }}</b
          >、副屬 <b>{{ labels.sub }}</b
          >。「重建值」是拿基準照公式算回面板的結果 ——
          <b>跟面板值一致才代表基準是對的</b>，對不上就是漏了某個來源或數字打錯。 對上之後，
          「裝備變更」頁換裝時的戰鬥力差值就是精確的。
        </p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.mb-char {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 0 24px;
}

/* 戰鬥力 */
.mb-power {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 28px;
  padding: 6px 0;
}

.mb-power-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.mb-power-label {
  font-size: 12px;
  opacity: 0.7;
}

.mb-power-value {
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.mb-power-value.is-off,
.mb-power-diff.is-off {
  color: #ffb454;
}

.mb-power-diff {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
}

.mb-power-warn {
  margin: 4px 0 0;
  font-size: 11px;
  line-height: 1.6;
  color: #ffb454;
}

.mb-elem {
  display: flex;
  justify-content: space-between;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 12px;
}

.mb-elem-label {
  opacity: 0.7;
}

.mb-elem-value {
  font-variant-numeric: tabular-nums;
}

/* 面板：兩欄，比照遊戲屬性視窗 */
.mb-panel {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 2px 16px;
}

.mb-panel-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 12px;
}

.mb-panel-label {
  opacity: 0.7;
}

.mb-panel-value {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* 極限屬性 */
.mb-hyper {
  margin: 0;
  padding: 0;
  list-style: none;
}

.mb-hyper li {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 3px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 12px;
}

.mb-hyper-lv {
  width: 46px;
  flex-shrink: 0;
  color: var(--accent, #6c8cff);
  font-size: 11px;
  font-weight: 700;
}

.mb-hyper-name {
  flex: 1;
  min-width: 0;
}

.mb-hyper-inc {
  opacity: 0.7;
  font-size: 11px;
}

.mb-field {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

/* 戰鬥力基準 */

.mb-check {
  margin-bottom: 8px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.mb-check-row {
  display: grid;
  grid-template-columns: 1fr 90px 90px 80px;
  gap: 6px;
  padding: 3px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  text-align: right;
}

.mb-check-row span:first-child {
  text-align: left;
}

.mb-check-row--head {
  font-size: 10px;
  opacity: 0.55;
}

.mb-check-row.ok span:last-child {
  color: #7fe0a0;
}

.mb-check-row.bad span:last-child {
  color: #ff9090;
  font-weight: 700;
}

.mb-src {
  margin-bottom: 8px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.mb-src-row {
  display: grid;
  grid-template-columns: 84px 1fr 1fr 1fr 64px;
  gap: 6px;
  padding: 3px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  text-align: right;
}

.mb-src-row span:first-child {
  text-align: left;
}

.mb-src-row--head {
  font-size: 10px;
  opacity: 0.55;
}

.mb-src-label {
  opacity: 0.75;
}

.mb-bl-table {
  display: grid;
  grid-template-columns: 92px repeat(5, minmax(0, 1fr));
  align-items: center;
  gap: 3px 6px;
  margin-top: 6px;
}

.mb-bl-table--dmg {
  grid-template-columns: 92px repeat(2, minmax(0, 1fr));
  max-width: 380px;
}

.mb-wep {
  margin-top: 8px;
  padding: 6px 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
}

.mb-wep-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  font-size: 11px;
}

.mb-wep-line + .mb-wep-line {
  margin-top: 6px;
}

.mb-wep-corr {
  margin-left: auto;
  font-weight: 700;
}

.mb-wep-pick {
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0.8;
}

.mb-extra {
  margin-top: 8px;
}

.mb-extra-hint {
  margin: 2px 0 0;
  font-size: 10px;
  opacity: 0.5;
}

/* 欄名與列名比照上游的 .st-cell-label：12px / 600 / 近白，只有表頭壓一級 */
.mb-bl-head {
  font-size: var(--fs-small, 11px);
  font-weight: 600;
  color: rgba(255, 255, 255, 0.62);
  text-align: center;
}

.mb-bl-rowlabel {
  font-size: var(--fs-base, 12px);
  font-weight: 600;
  color: rgba(255, 255, 255, 0.92);
}

.mb-bl-cell {
  width: 100%;
  min-width: 0;
  text-align: right;
}

.mb-fam-summary {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 12px;
}

.mb-fam-summary-value {
  color: #7fe0d0;
  font-variant-numeric: tabular-nums;
}

.mb-fam-summary-empty {
  opacity: 0.5;
}

.mb-fam-summary small {
  margin-left: auto;
  font-size: 11px;
  opacity: 0.6;
}

.mb-field-label {
  width: 120px;
  flex-shrink: 0;
  opacity: 0.75;
}

.mb-field-suffix {
  width: 62px;
  flex-shrink: 0;
  font-size: 11px;
  opacity: 0.6;
}
</style>
