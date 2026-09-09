# MapleBuilding

楓之谷角色構築模擬器，適用於 Windows 10 / 11。

以 Vue 3、Vite、TypeScript 與 Tauri 2 開發。

> 本專案基於 [centre173/MapleCombat](https://github.com/centre173/MapleCombat)（MIT）開發。
> 原專案是戰鬥力計算機，本專案在其基礎上擴充為完整的角色構築模擬器。

## 功能

目前：

- 戰鬥力計算（對齊遊戲內數值，含單精度浮點與百分比捨去處理）
- 裝備變更試算（原裝備 / 變更後對照，同時給戰鬥力增幅與實際增幅）
- 數值換算
- 狀態 1–5 多情境比較與加權

規劃中：

- 透過 NEXON Open API 自動帶入角色資料
- 裝備規劃
- 製作策略試算（方塊、星力等成本模擬）

## 下載

到 [Releases](../../releases) 下載：

- 可攜版 `MapleBuilding-x.x.x.exe`：免安裝，下載後可直接執行。
- 安裝檔 `*-setup.exe`（NSIS）：安裝後會建立開始選單捷徑，也可從控制台移除。

## 從原始碼建置

需求:Node.js 22+、Rust(stable);Windows 另需 MSVC build tools 與 WebView2。

```bash
npm ci
npm run tauri build   # 產出可攜 .exe 與 NSIS 安裝檔於 src-tauri/target/release/
npm run tauri dev     # 開發
npm run test          # 測試
```

## 存檔相容性

可直接匯入原專案 MapleCombat 的存檔 JSON，格式相容。新版匯出的檔案標記為
`"app": "maplebuilding"`，檔名為 `maplebuilding-save-<時間>.json`。

## 授權

程式碼採 [MIT](LICENSE)。本專案沿用上游 MapleCombat 的 MIT 授權，
原始著作權聲明保留於 `LICENSE` 檔中，本專案新增的程式碼同樣以 MIT 釋出。

遊戲名稱與圖像版權均歸 © NEXON Korea Corporation；本工具為非官方開發工具，
僅作為非營利學習用途。`src/assets/` 下的遊戲素材不在 MIT 授權範圍內。
