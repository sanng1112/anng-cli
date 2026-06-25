## Makefile for ANNG CLI

.PHONY: build
build:
	go build -o anng ./cmd/anng

.PHONY: test
test:
	go test ./...

.PHONY: verify
verify:
	go test ./...
	go build ./cmd/anng

.PHONY: clean
clean:
	rm -f anng
