FROM golang:1.25.12-bookworm AS build

WORKDIR /src
COPY go.mod main.go main_test.go ./
RUN go test ./...
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /out/send-scan-server .

FROM clamav/clamav-debian:1.5.3

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV CLAMD_STARTUP_TIMEOUT=600 \
    CLAMD_CONF_StreamMaxLength=2147483648 \
    CLAMD_CONF_MaxFileSize=2147483648 \
    CLAMD_CONF_MaxScanSize=2147483648 \
    CLAMD_CONF_MaxScanTime=720000 \
    SCAN_MAX_BYTES=2147483648

COPY --from=build /out/send-scan-server /usr/local/bin/send-scan-server
COPY send-scan-entrypoint.sh /usr/local/bin/send-scan-entrypoint
RUN chmod 0555 /usr/local/bin/send-scan-server /usr/local/bin/send-scan-entrypoint

EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/send-scan-entrypoint"]
