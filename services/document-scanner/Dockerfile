FROM clamav/clamav:1.4.7@sha256:b7357e2c1c59480628839df301b0d27923561389b36cf341911e1dd9e02cdd05

RUN apk add --no-cache python3 \
    && python3 -c 'import sys; assert sys.version_info >= (3, 11)'

WORKDIR /opt/crecy-scanner
COPY entrypoint.py server.py clamd.conf freshclam.conf ./

ENV PORT=8080 \
    CLAMD_SOCKET=/tmp/crecy-clamd.sock \
    TZ=UTC \
    LC_ALL=C \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

USER clamav:clamav
EXPOSE 8080
ENTRYPOINT ["python3", "/opt/crecy-scanner/entrypoint.py"]
