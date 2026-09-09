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
