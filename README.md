# GLM-OCR Service

基于 [GLM-OCR](https://huggingface.co/zai-org/GLM-OCR) 模型的 OCR 服务，支持图片和 PDF 文字识别。

## 功能特性

- 支持多种图片格式：PNG, JPG, JPEG, GIF, BMP
- 支持 PDF 文件（自动拆分页面）
- 支持批量上传
- GPU 加速（自动检测）
- 简洁的 Web 界面
- RESTful API

## 环境要求

- Python 3.10+
- CUDA 11.8+（可选，用于 GPU 加速）
- 8GB+ 显存（GPU 模式）或 16GB+ 内存（CPU 模式）

## 安装

```bash
# 克隆或进入项目目录
cd D:\mycode\glmocr

# 创建虚拟环境（推荐）
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac

# 安装依赖
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
pip install transformers fastapi uvicorn python-multipart pillow pymupdf
```

## 启动服务

```bash
# 方式1：直接运行
python server.py

# 方式2：使用 uvicorn（支持热重载）
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

服务启动后访问：http://localhost:8000

## API 文档

### 1. 服务状态

```
GET /api/status
```

响应：
```json
{
  "status": "running",
  "model_loaded": true,
  "device": "cuda"
}
```

### 2. 单文件 OCR

```
POST /api/ocr
Content-Type: multipart/form-data

file: <图片或PDF文件>
```

响应：
```json
{
  "success": true,
  "filename": "test.png",
  "pages": 1,
  "results": [
    {
      "page": 1,
      "text": "识别出的文字内容..."
    }
  ]
}
```

### 3. 批量 OCR

```
POST /api/ocr/batch
Content-Type: multipart/form-data

files: <文件1>
files: <文件2>
...
```

响应：
```json
{
  "total": 2,
  "results": [
    {
      "filename": "file1.png",
      "success": true,
      "data": { ... }
    },
    {
      "filename": "file2.pdf",
      "success": true,
      "data": { ... }
    }
  ]
}
```

## 使用示例

### Python

```python
import requests

# 单文件
with open('image.png', 'rb') as f:
    response = requests.post(
        'http://localhost:8000/api/ocr',
        files={'file': f}
    )
    print(response.json())

# 批量
files = [
    ('files', open('image1.png', 'rb')),
    ('files', open('image2.png', 'rb')),
]
response = requests.post(
    'http://localhost:8000/api/ocr/batch',
    files=files
)
print(response.json())
```

### cURL

```bash
# 单文件
curl -X POST -F "file=@image.png" http://localhost:8000/api/ocr

# PDF
curl -X POST -F "file=@document.pdf" http://localhost:8000/api/ocr
```

## 项目结构

```
glmocr/
├── server.py      # FastAPI 服务端
├── index.html     # Web 前端页面
├── README.md      # 说明文档
├── uploads/       # 临时上传目录（自动创建）
└── venv/          # 虚拟环境（可选）
```

## 性能参考

| 设备 | 单张图片 | 备注 |
|------|----------|------|
| RTX 3090 | ~1.5s | float16 |
| RTX 3060 | ~2.5s | float16 |
| CPU | ~15-30s | float32 |

首次运行会自动下载模型（约 2GB），请确保网络畅通。

## 常见问题

### Q: 显存不足怎么办？
A: 可以在 `server.py` 中修改 `torch_dtype=torch.float32` 使用 CPU 模式。

### Q: 模型下载失败？
A: 设置 HuggingFace 镜像：
```bash
set HF_ENDPOINT=https://hf-mirror.com  # Windows
export HF_ENDPOINT=https://hf-mirror.com  # Linux
```

### Q: 中文识别效果不好？
A: GLM-OCR 对中文支持较好，如果效果不佳，尝试提高图片分辨率或清晰度。

## License

MIT
