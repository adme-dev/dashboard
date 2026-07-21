package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	clamClean    = "clean"
	clamDetected = "detected"
)

type scanRequest struct {
	SchemaVersion    int    `json:"schemaVersion"`
	JobID            string `json:"jobId"`
	ObjectETag       string `json:"objectEtag"`
	ExpectedMimeType string `json:"expectedMimeType"`
}

type scanResult struct {
	SchemaVersion    int    `json:"schemaVersion"`
	JobID            string `json:"jobId"`
	ObjectETag       string `json:"objectEtag"`
	Provider         string `json:"provider"`
	EngineVersion    string `json:"engineVersion"`
	SignatureVersion string `json:"signatureVersion"`
	Verdict          string `json:"verdict"`
	ReasonCode       string `json:"reasonCode"`
	DetectedMimeType string `json:"detectedMimeType"`
	ActiveContent    bool   `json:"activeContent"`
	ScannedAt        string `json:"scannedAt"`
}

func detectContentEvidence(prefix []byte) (string, bool) {
	contentType := http.DetectContentType(prefix)
	if parsed, _, err := mime.ParseMediaType(contentType); err == nil {
		contentType = parsed
	}
	lower := strings.ToLower(string(prefix))
	switch {
	case bytes.HasPrefix(prefix, []byte{'M', 'Z'}):
		contentType = "application/x-msdownload"
	case bytes.HasPrefix(prefix, []byte{0x7f, 'E', 'L', 'F'}):
		contentType = "application/x-elf"
	case bytes.HasPrefix(prefix, []byte{0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1}):
		contentType = "application/x-ole-storage"
	case strings.Contains(lower, "<svg"):
		contentType = "image/svg+xml"
	}
	active := contentType == "text/html" ||
		contentType == "image/svg+xml" ||
		contentType == "application/xhtml+xml" ||
		contentType == "application/x-msdownload" ||
		contentType == "application/x-elf" ||
		(contentType == "application/pdf" &&
			(strings.Contains(lower, "/javascript") || strings.Contains(lower, "/js")))
	return contentType, active
}

func decodeScanRequest(body io.Reader) (scanRequest, error) {
	limited := &io.LimitedReader{R: body, N: 8*1024 + 1}
	decoder := json.NewDecoder(limited)
	decoder.DisallowUnknownFields()
	var input scanRequest
	if err := decoder.Decode(&input); err != nil {
		return scanRequest{}, err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		if err == nil {
			return scanRequest{}, errors.New("request contained more than one JSON value")
		}
		return scanRequest{}, err
	}
	if limited.N == 0 {
		return scanRequest{}, errors.New("request exceeded its contract limit")
	}
	if input.SchemaVersion != 1 || input.JobID == "" || input.ObjectETag == "" || input.ExpectedMimeType == "" {
		return scanRequest{}, errors.New("request failed contract validation")
	}
	return input, nil
}

func parseClamResponse(raw string) (string, error) {
	normalized := strings.TrimSpace(strings.TrimRight(raw, "\x00"))
	if strings.HasSuffix(normalized, " OK") {
		return clamClean, nil
	}
	if strings.HasSuffix(normalized, " FOUND") {
		return clamDetected, nil
	}
	return "", errors.New("clamd returned a non-verdict response")
}

func parseClamVersion(raw string) (string, string) {
	normalized := strings.TrimSpace(strings.TrimRight(raw, "\x00"))
	parts := strings.Split(normalized, "/")
	if len(parts) < 2 {
		return "unknown", "unknown"
	}
	engine := strings.TrimPrefix(strings.TrimSpace(parts[0]), "ClamAV ")
	signatures := strings.TrimSpace(parts[1])
	if engine == "" {
		engine = "unknown"
	}
	if signatures == "" {
		signatures = "unknown"
	}
	return engine, signatures
}

type clamDaemonClient struct {
	address string
}

func (client clamDaemonClient) connection(ctx context.Context) (net.Conn, error) {
	connection, err := (&net.Dialer{}).DialContext(ctx, "tcp", client.address)
	if err != nil {
		return nil, err
	}
	if deadline, ok := ctx.Deadline(); ok {
		if err := connection.SetDeadline(deadline); err != nil {
			connection.Close()
			return nil, err
		}
	}
	return connection, nil
}

func (client clamDaemonClient) version(ctx context.Context) (string, string, error) {
	connection, err := client.connection(ctx)
	if err != nil {
		return "unknown", "unknown", err
	}
	defer connection.Close()
	if _, err = io.WriteString(connection, "zVERSION\x00"); err != nil {
		return "unknown", "unknown", err
	}
	raw, err := bufio.NewReader(connection).ReadString('\x00')
	if err != nil && !errors.Is(err, io.EOF) {
		return "unknown", "unknown", err
	}
	engine, signatures := parseClamVersion(raw)
	return engine, signatures, nil
}

func (client clamDaemonClient) scan(ctx context.Context, source io.Reader) (string, error) {
	connection, err := client.connection(ctx)
	if err != nil {
		return "", err
	}
	defer connection.Close()
	if _, err = io.WriteString(connection, "zINSTREAM\x00"); err != nil {
		return "", err
	}
	buffer := make([]byte, 64*1024)
	for {
		read, readErr := source.Read(buffer)
		if read > 0 {
			var size [4]byte
			binary.BigEndian.PutUint32(size[:], uint32(read))
			if _, err = connection.Write(size[:]); err != nil {
				return "", err
			}
			if _, err = connection.Write(buffer[:read]); err != nil {
				return "", err
			}
		}
		if errors.Is(readErr, io.EOF) {
			break
		}
		if readErr != nil {
			return "", readErr
		}
	}
	if _, err = connection.Write([]byte{0, 0, 0, 0}); err != nil {
		return "", err
	}
	raw, err := bufio.NewReader(connection).ReadString('\x00')
	if err != nil && !errors.Is(err, io.EOF) {
		return "", err
	}
	return parseClamResponse(raw)
}

type countingReader struct {
	reader io.Reader
	read   int64
}

func (reader *countingReader) Read(buffer []byte) (int, error) {
	read, err := reader.reader.Read(buffer)
	reader.read += int64(read)
	return read, err
}

type scanServer struct {
	clam       clamDaemonClient
	sourceURL  string
	maxBytes   int64
	httpClient *http.Client
}

func scanFailureReason(scanErr error, bytesRead, maxBytes int64) string {
	if bytesRead > maxBytes {
		return "OBJECT_READ_FAILED"
	}
	if scanErr != nil {
		return "SCANNER_UNAVAILABLE"
	}
	return ""
}

func (server scanServer) normalizedError(request scanRequest, verdict, reasonCode string, scannedAt time.Time) scanResult {
	return scanResult{
		SchemaVersion: 1, JobID: request.JobID, ObjectETag: request.ObjectETag,
		Provider: "clamav", EngineVersion: "unknown", SignatureVersion: "unknown",
		Verdict: verdict, ReasonCode: reasonCode, DetectedMimeType: "application/octet-stream",
		ActiveContent: false, ScannedAt: scannedAt.UTC().Format(time.RFC3339),
	}
}

func writeJSON(response http.ResponseWriter, status int, result scanResult) {
	response.Header().Set("Content-Type", "application/json")
	response.Header().Set("Cache-Control", "no-store")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(result)
}

func (server scanServer) handleScan(response http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		response.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	input, err := decodeScanRequest(request.Body)
	if err != nil {
		response.WriteHeader(http.StatusBadRequest)
		return
	}
	ctx, cancel := context.WithTimeout(request.Context(), 13*time.Minute)
	defer cancel()
	scannedAt := time.Now()
	sourceRequest, err := http.NewRequestWithContext(ctx, http.MethodGet, server.sourceURL, nil)
	if err != nil {
		writeJSON(response, http.StatusOK, server.normalizedError(input, "error", "OBJECT_READ_FAILED", scannedAt))
		return
	}
	source, err := server.httpClient.Do(sourceRequest)
	if err != nil || source.StatusCode != http.StatusOK {
		if source != nil {
			source.Body.Close()
		}
		writeJSON(response, http.StatusOK, server.normalizedError(input, "error", "OBJECT_READ_FAILED", scannedAt))
		return
	}
	defer source.Body.Close()
	if source.Header.Get("X-Object-ETag") != input.ObjectETag ||
		(source.ContentLength >= 0 && source.ContentLength > server.maxBytes) {
		writeJSON(response, http.StatusOK, server.normalizedError(input, "error", "OBJECT_READ_FAILED", scannedAt))
		return
	}
	prefix := make([]byte, 4096)
	read, readErr := io.ReadFull(source.Body, prefix)
	if readErr != nil && !errors.Is(readErr, io.EOF) && !errors.Is(readErr, io.ErrUnexpectedEOF) {
		writeJSON(response, http.StatusOK, server.normalizedError(input, "error", "OBJECT_READ_FAILED", scannedAt))
		return
	}
	prefix = prefix[:read]
	detectedMimeType, activeContent := detectContentEvidence(prefix)
	limited := &countingReader{reader: io.LimitReader(io.MultiReader(bytes.NewReader(prefix), source.Body), server.maxBytes+1)}
	engine, signatures, versionErr := server.clam.version(ctx)
	if versionErr != nil {
		result := server.normalizedError(input, "error", "SCANNER_UNAVAILABLE", scannedAt)
		writeJSON(response, http.StatusOK, result)
		return
	}
	clamVerdict, scanErr := server.clam.scan(ctx, limited)
	if ctx.Err() != nil {
		result := server.normalizedError(input, "timeout", "SCAN_TIMEOUT", scannedAt)
		result.EngineVersion, result.SignatureVersion = engine, signatures
		writeJSON(response, http.StatusOK, result)
		return
	}
	if reasonCode := scanFailureReason(scanErr, limited.read, server.maxBytes); reasonCode != "" {
		result := server.normalizedError(input, "error", reasonCode, scannedAt)
		result.EngineVersion, result.SignatureVersion = engine, signatures
		writeJSON(response, http.StatusOK, result)
		return
	}
	verdict, reasonCode := "clean", "NONE"
	if clamVerdict == clamDetected {
		verdict, reasonCode = "detected", "MALWARE_DETECTED"
	}
	writeJSON(response, http.StatusOK, scanResult{
		SchemaVersion: 1, JobID: input.JobID, ObjectETag: input.ObjectETag,
		Provider: "clamav", EngineVersion: engine, SignatureVersion: signatures,
		Verdict: verdict, ReasonCode: reasonCode, DetectedMimeType: detectedMimeType,
		ActiveContent: activeContent, ScannedAt: scannedAt.UTC().Format(time.RFC3339),
	})
}

func main() {
	maxBytes := int64(2 * 1024 * 1024 * 1024)
	if configured, err := strconv.ParseInt(os.Getenv("SCAN_MAX_BYTES"), 10, 64); err == nil && configured > 0 {
		maxBytes = configured
	}
	server := scanServer{
		clam:       clamDaemonClient{address: "127.0.0.1:3310"},
		sourceURL:  "http://send-scan.r2/object",
		maxBytes:   maxBytes,
		httpClient: &http.Client{},
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/scan", server.handleScan)
	httpServer := &http.Server{
		Addr:              ":8080",
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      14 * time.Minute,
		IdleTimeout:       30 * time.Second,
	}
	if err := httpServer.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		os.Exit(1)
	}
}
