FROM python:3.12-slim
WORKDIR /relay
COPY server.py ./
COPY web ./web
ENV PORT=8950 PYTHONUNBUFFERED=1
EXPOSE 8950
USER nobody
CMD ["python", "server.py"]
