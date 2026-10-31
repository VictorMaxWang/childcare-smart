FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000 \
    BRAIN_MEMORY_SQLITE_PATH=/data/agent-memory.db

WORKDIR /app/backend

COPY backend/requirements.txt ./requirements.txt

RUN pip install --upgrade pip && \
    pip install -r requirements.txt && \
    mkdir -p /data

# 使用项目根目录作为构建上下文，保留源码的 backend/shared 相对关系。
# 月龄照护规则是业务输入，遗漏它会让趋势、儿童汇总等运行时接口失败。
COPY backend/app ./app
COPY backend/scripts ./scripts
COPY backend/asgi.py ./asgi.py
COPY shared /app/shared

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers"]
