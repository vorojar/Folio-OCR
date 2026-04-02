# Changelog

## [3.2.0] - 2026-04-02

### Added
- **分栏检测**：自动识别多栏文档（如试卷），按正确阅读顺序输出（全宽标题 → 左栏 → 右栏）
- **Re-scan 按钮**：支持强制重新扫描当前页，忽略缓存（`/api/ocr/{doc_id}/{page_num}?force=true`）
- **居中区域识别**：居中的窄标题（如"A1/A2 型选择题"）不再被错误归入左右栏
- **跨区域去重**：Preview 模式不再显示 GLM-OCR 重复输出的 display math 内容

### Fixed
- LaTeX 复合数学表达式（`$5^{\circ}$`、`$$15^{\circ}\sim 20^{\circ}$$`）现在正确转换为 Unicode（5°、15°∼20°）
- GLM-OCR 输出的 `$$...$$` display math 重复行被自动去除
- 去重范围从仅检查相邻行扩展为检查所有前文行
- Preview 模式空区域不再显示 "No text recognized"
- **跨栏题目修复**：layout 模型漏检的栏间间隙（如题目选项从左栏延续到右栏顶部）通过合成区域自动填补
- 居中区域检测增加高度约束（≤50px），避免多行文本块被误判为全宽标题

### Removed
- 移除 Reflow / Reflow All 按钮及段落重排代码（对试卷类文档会破坏排版）

## [3.1.0] - 2026-03-17

### Features
- 三栏布局文档 OCR 工作台，基于 GLM-OCR (Ollama)
- FastAPI 后端 + 纯前端单文件架构
- PDF/图片混合上传，SSE 流式页面加载
- SQLite 持久化，自动恢复上次文档
- Layout 检测（PP-DocLayoutV3），按区域裁剪 OCR
- 编辑/预览切换，HTML 表格原生渲染
- 批量 OCR（OCR All Pages），进度条 + ETA
- 导出 .md / .txt / .docx
- LaTeX → Unicode 转换（希腊字母、数学符号、分数、带圈数字）
- 自动启动 Ollama，模型预热
