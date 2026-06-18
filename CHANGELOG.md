# Changelog

## [3.4.0] - 2026-06-18

### Added
- 新增 Python 包结构和 `folio-ocr` 命令入口，支持 `uvx --from git+https://github.com/vorojar/Folio-OCR folio-ocr`
- 新增 `pyproject.toml`，Release 工作流会构建 wheel / sdist 并上传到 GitHub Release
- 新增 GitHub Actions CI，统一运行 `scripts/verify.sh`、构建包并检查分发元数据
- 新增 MIT `LICENSE` 文件和 GitHub bug report issue template
- Docker Compose 新增 `OLLAMA_VERSION` 覆盖入口，便于临时验证 Ollama 版本兼容性
- 新增 `OCR_REQUEST_TIMEOUT_MS` 配置，默认 300 秒并通过 `/api/status` 暴露给前端

### Changed
- 首页和 README 前置 `uvx` / Docker 快速启动路径，更强调 30 秒看懂和 3 分钟跑通
- 应用资源移动到 `folio_ocr/` 包目录，根目录 `server.py` 保留兼容入口
- 运行时数据库、日志和上传目录默认写入当前工作目录，适配 `uvx` / `pipx` 安装后的只读包目录

### Fixed
- 单页 OCR、预识别、批量 OCR 和 Re-scan 统一使用可配置 OCR 请求超时，减少长 PDF 在浏览器侧被 120 秒中断的问题
- Re-scan 现在会保留当前 layout 设置，并在失败时显示明确错误提示

## [3.3.1] - 2026-05-28

### Fixed
- Ollama `/api/chat` 请求默认传入 `options.num_ctx=16384`，规避 GLM-OCR 在图片 OCR 时因上下文过小触发 `GGML_ASSERT(a->ne[2] * 4 == b->ne[0]) failed`
- 新增 `OLLAMA_NUM_CTX` 环境变量，可按机器内存和图片复杂度调整上下文大小

## [3.3.0] - 2026-05-25

### Added
- 新增 EPUB 导出，支持将多页 OCR 结果打包为标准 `.epub` 文件
- 新增 `LAYOUT_DEVICE` 环境变量，可选择 `cpu`、`cuda` 或 `auto`
- README 增加 Ollama `model failed to load` 排查步骤和批量处理建议

### Fixed
- HTML 表格不再在 OCR 后处理阶段被压平成纯文本，Markdown、DOCX 和 EPUB 导出会保留表格结构
- TXT 导出单独将 HTML 表格转为制表符分隔文本，避免影响结构化导出
- Load Model 预热失败时不再误报成功，会返回 Ollama 的具体错误和资源提示
- 默认让版面分析模型使用 CPU，减少与 Ollama 抢占 GPU 显存导致模型加载失败的概率

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
