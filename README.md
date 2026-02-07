# Folio-OCR

基于 [GLM-OCR](https://huggingface.co/zai-org/GLM-OCR) + [Ollama](https://ollama.com/) 的三栏文档 OCR 工作台，专为书籍和文档的日常批量识别设计。

![架构](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square) ![前端](https://img.shields.io/badge/Frontend-Vanilla_JS-F7DF1E?style=flat-square) ![数据库](https://img.shields.io/badge/DB-SQLite-003B57?style=flat-square)

## 功能特性

### OCR 核心
- 支持多种图片格式：PNG、JPG、GIF、BMP
- 支持 PDF 文件（PyMuPDF 2x 高分辨率拆页）
- 多文件混合上传（图片 + PDF 混选）
- 版面分析（Layout Detection）自动分区识别
- 相邻文本区域智能合并，减少 OCR 调用次数（11 区域 → 3 组，2.5x 加速）
- LaTeX 特殊字符自动转 Unicode（`$\textcircled{1}$` → `①`）
- 模型输出自动清理 ` ```markdown ``` ` 围栏

### 批量处理
- 一键「OCR All Pages」批量识别全部页面
- 实时进度条 + ETA 时间估算
- 随时可停（Stop 按钮立即中断当前请求）
- 选中页面时自动预识别下一页（Pre-OCR）

### 编辑与导出
- Edit / Preview 双模式切换
- Preview 模式原生渲染 HTML 表格和 Markdown
- 段落重排（Reflow）：合并因换行断开的段落
- 导出三种格式：`.md`（Markdown）、`.txt`（纯文本）、`.docx`（Word）
- DOCX 导出基于 python-docx，真实 Word 文档，含分节符和页码
- 单页/全文一键复制

### 数据持久化
- SQLite 数据库（`folio_ocr.db`），文档和 OCR 结果服务重启不丢失
- 编辑内容 800ms 防抖自动保存
- 页面加载时自动恢复上次打开的文档
- 多文档管理：左侧面板上方文档列表，支持切换和删除

### 界面交互
- 三栏布局：页面缩略图 | 图片预览 | OCR 结果
- 右侧面板可拖拽调整宽度
- SSE 流式上传，逐页实时加载
- 版面区域双向高亮（点击图片框 ↔ 点击文本块）
- 全文搜索（Ctrl+F），跨页高亮 + 命中计数
- 键盘导航（↑↓ 切换页面）
- 暖色奶油/炭灰主题，中文字体适配

### 网络容错
- 所有网络请求带超时保护（按场景分档：5s ~ 180s）
- Toast 弹窗通知：保存失败、OCR 超时、加载错误等即时反馈
- Ollama 断开后 UI 不会冻住，超时后自动恢复可操作状态

## 环境要求

- Python 3.10+
- [Ollama](https://ollama.com/) 已安装且 `ollama` 在 PATH 中
- 拉取 OCR 模型：`ollama pull glm-ocr`

## 快速开始

```bash
# 安装依赖
pip install -r requirements.txt

# 拉取模型
ollama pull glm-ocr

# 启动服务
python server.py

# 或使用热重载开发
uvicorn server:app --reload --host 0.0.0.0 --port 3000

# Windows 一键启动
start.bat
```

服务启动后访问：http://localhost:3000

## 项目结构

```
glmocr/
├── server.py           # FastAPI 后端（单文件）
├── index.html          # HTML 页面
├── script.js           # 前端逻辑
├── style.css           # 样式
├── latex_unicode.json  # LaTeX → Unicode 映射表
├── requirements.txt    # Python 依赖
├── start.bat           # Windows 启动脚本
├── folio_ocr.db        # SQLite 数据库（运行时生成）
└── uploads/            # 上传文件目录（运行时生成）
```

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/status` | 服务状态、Ollama 连通性 |
| POST | `/api/load-model` | 启动 Ollama 并预热模型 |
| POST | `/api/upload` | 上传文件，返回 SSE 页面流 |
| GET | `/api/images/{doc_id}/{filename}` | 获取页面图片 |
| POST | `/api/ocr/{doc_id}/{page_num}` | 单页 OCR |
| POST | `/api/export/{doc_id}` | 导出 DOCX |
| GET | `/api/documents` | 列出所有文档 |
| GET | `/api/documents/{doc_id}` | 获取文档详情（含所有页面） |
| DELETE | `/api/documents/{doc_id}` | 删除文档 |
| PUT | `/api/pages/{doc_id}/{page_num}/text` | 保存编辑后的文本 |

## 性能参考

- 模型冷启动首次请求：~50s
- 后续单页识别：~0.5s
- PDF 以 2x 缩放矩阵渲染，保证 OCR 质量

## License

MIT
