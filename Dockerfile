FROM node:22-bookworm-slim AS ui-build

WORKDIR /app/ui
COPY ui/package*.json ./
RUN npm ci
COPY ui/ ./
RUN npm run build

FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1
ENV DYNANADIO_HOME=/data/dynadio

COPY pyproject.toml ./
COPY core ./core
COPY api ./api
COPY cli ./cli
COPY samples ./samples
COPY reference ./reference
COPY --from=ui-build /app/ui/dist ./ui/dist

RUN pip install --no-cache-dir .

RUN mkdir -p /data/dynadio
EXPOSE 8000

CMD ["sh", "-c", "uvicorn dynadio_api.app:app --host 0.0.0.0 --port ${PORT:-8000}"]
