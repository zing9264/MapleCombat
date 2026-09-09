# 對帳工具

`reconcile.mjs` 把 API 的裝備資料加總後，與遊戲內能力值 tooltip 的「裝備道具」
數字逐項比對。這是換裝比較引擎的正確性防線 —— 加總邏輯錯了，上層 UI 顯示的
每個數字都是錯的。

## 用法

```bash
# 先用自己的 API Key 抓下 item-equipment 與 set-effect 兩份 JSON
node tools/building/reconcile.mjs item.json set.json
```

腳本內的 truth 值取自 283 級主教「藜樂拌楓糖」的遊戲內 tooltip，
換角色測試時要一併換掉。

## 目前狀態

已對上：INT %未套用（寶石 1750）、魔攻 %（76）、LUK %（120）、爆傷 %（13）

尚有缺口：需要找到一個同時提供
「全屬性 +50、魔法攻擊力 +350、攻擊Boss怪物時傷害 +10%」的來源。
INT 與 LUK 都剛好差 50，代表缺的是單一個「全屬性」來源而非兩個獨立誤差。

## 建置解析器

腳本相依的 `parser.mjs` 是從 TypeScript 原始碼建出來的，不進版控：

```bash
npx esbuild src/building/core/optionParser.ts --format=esm --outfile=tools/building/parser.mjs
```

## API 已知的資料缺口

遊戲內確實存在、但 API 不回傳或放在別處的來源。加總時必須自行補上：

| 來源 | 端點 | 備註 |
| --- | --- | --- |
| 寵物裝備 | `/character/pet-equipment` | 遊戲算進「裝備道具」，但在獨立端點。實測 +315 魔攻 |
| 套裝效果 | `/character/set-effect` | **件數不可信，見下** |
| 寶石 | `/character/item-equipment` | 數值只在 `item_total_option`，四分層皆 0，且歸「%未套用」 |
| 靈魂武器（新系統） | **無** | `soul_*` 是舊靈魂水晶系統的欄位。實測共鳴效果**不計入**「裝備道具」，不要補 |

## 最重要的一條：`total_set_count` 不可信

實測與遊戲內套裝視窗逐一比對，API 的件數**兩個方向都會錯**：

| 套裝 | API | 遊戲實際 | 差異原因 |
| --- | --- | --- | --- |
| 航海師套裝(法師) | 3 | **4** | 創世長杖以「幸運道具」身分計入，API 沒算 |
| 永恆套裝(法師) | 2 | **3** | 創世長杖本身就是永恆套裝武器，API 沒算 |
| 神祕冥界套裝(法師) | 3 | **2** | API 多算 |
| 小小時光音樂會套組 | 3 | **2** | API 多算 |

因此**不能直接使用 `total_set_count`**，必須從 `item-equipment` 的實際裝備反推套裝件數。
這需要一份「道具名稱 → 所屬套裝」的對照表，且要處理創世／命運武器可同時計入
兩個套裝的情況。

## 其他規則

- 給「技能」的套裝效果不計入裝備道具。例如小小時光音樂會套組給的是
  「滴答滴答童話時間」技能（攻擊力/魔力 +18），歸在技能桶。
- 無視防禦率是乘法疊加：`1-(1-a)(1-b)...`
- 最終傷害是乘法：技能 233.49% 與萌獸 20% 相乘得 300.19%
- 爆擊傷害是加法

## 目前對帳結果：七項全部吻合

    INT  基本 · 裝備道具   3854 ✅      INT %未套用（寶石）  1750 ✅
    LUK  基本 · 裝備道具   3065 ✅      魔攻 %                 76 ✅
    魔攻 基本 · 裝備道具   3859 ✅      LUK  %                120 ✅
    Boss傷 · 裝備道具 %     253 ✅

## 用法

```bash
npx esbuild src/building/core/optionParser.ts --format=esm --outfile=tools/building/parser.mjs
node tools/building/reconcile.mjs item-equipment.json
```

腳本內的套裝件數與各階效果取自 283 級主教「藜樂拌楓糖」的遊戲內套裝視窗，
換角色測試時要一併更新。
