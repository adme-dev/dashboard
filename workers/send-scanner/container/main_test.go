package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestDetectContentEvidence(t *testing.T) {
	tests := []struct {
		name     string
		content  string
		mimeType string
		active   bool
	}{
		{"pdf", "%PDF-1.7\nplain document", "application/pdf", false},
		{"pdf javascript", "%PDF-1.7\n/JavaScript (alert)", "application/pdf", true},
		{"html", "<!doctype html><script>alert(1)</script>", "text/html", true},
		{"svg", "<?xml version=\"1.0\"?><svg><script/></svg>", "image/svg+xml", true},
		{"windows executable", "MZfake executable", "application/x-msdownload", true},
		{"elf executable", "\x7fELFfake executable", "application/x-elf", true},
		{"legacy Office container", "\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1", "application/x-ole-storage", false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			mimeType, active := detectContentEvidence([]byte(test.content))
			if mimeType != test.mimeType || active != test.active {
				t.Fatalf("got %q active=%v", mimeType, active)
			}
		})
	}
}

func TestParseClamResponseDoesNotExposeDetectionName(t *testing.T) {
	verdict, err := parseClamResponse("stream: Win.Test.CustomerFilename FOUND\x00")
	if err != nil || verdict != clamDetected {
		t.Fatalf("got verdict=%q err=%v", verdict, err)
	}

	verdict, err = parseClamResponse("stream: OK\x00")
	if err != nil || verdict != clamClean {
		t.Fatalf("got verdict=%q err=%v", verdict, err)
	}

	if _, err = parseClamResponse("INSTREAM size limit exceeded. ERROR\x00"); err == nil {
		t.Fatal("expected bounded scanner error")
	}
}

func TestParseClamVersion(t *testing.T) {
	engine, signatures := parseClamVersion("ClamAV 1.5.3/27730/Tue Jul 21 00:00:00 2026")
	if engine != "1.5.3" || signatures != "27730" {
		t.Fatalf("got engine=%q signatures=%q", engine, signatures)
	}
}

func TestScanFailureReasonPrioritizesOversizedObjectEvidence(t *testing.T) {
	if reason := scanFailureReason(nil, 101, 100); reason != "OBJECT_READ_FAILED" {
		t.Fatalf("got oversized reason %q", reason)
	}
	if reason := scanFailureReason(errors.New("test error"), 100, 100); reason != "SCANNER_UNAVAILABLE" {
		t.Fatalf("got scanner reason %q", reason)
	}
}

func TestDecodeScanRequestRejectsTrailingJSONAndOversizedBodies(t *testing.T) {
	valid := `{"schemaVersion":1,"jobId":"77777777-7777-4777-8777-777777777777","objectEtag":"etag","expectedMimeType":"application/pdf"}`
	decoded, err := decodeScanRequest(strings.NewReader(valid))
	if err != nil || decoded.JobID == "" {
		t.Fatalf("expected valid request, got %#v err=%v", decoded, err)
	}

	for name, body := range map[string]string{
		"trailing JSON": valid + `{}`,
		"unknown field": strings.TrimSuffix(valid, "}") + `,"objectKey":"secret"}`,
		"oversized":     valid + strings.Repeat(" ", 8*1024),
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := decodeScanRequest(strings.NewReader(body)); err == nil {
				t.Fatal("expected request to be rejected")
			}
		})
	}
}

func TestNormalizedResultCannotContainRawOutputOrObjectKey(t *testing.T) {
	result := scanResult{
		SchemaVersion:    1,
		JobID:            "77777777-7777-4777-8777-777777777777",
		ObjectETag:       "etag",
		Provider:         "clamav",
		EngineVersion:    "1.5.3",
		SignatureVersion: "27730",
		Verdict:          "detected",
		ReasonCode:       "MALWARE_DETECTED",
		DetectedMimeType: "application/pdf",
		ActiveContent:    false,
		ScannedAt:        "2026-07-21T01:00:00Z",
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{"rawOutput", "objectKey", "Win.Test", "/tmp/"} {
		if bytes.Contains(encoded, []byte(forbidden)) {
			t.Fatalf("result contains %q: %s", forbidden, encoded)
		}
	}
	if strings.Contains(string(encoded), "filename") {
		t.Fatalf("result contains filename evidence: %s", encoded)
	}
}
