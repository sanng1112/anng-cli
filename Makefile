## Makefile for ANNG CLI

# Build the Go binary
.PHONY: build
build:
	@echo "Building anng binary..."
	conda run -n go_env env CGO_ENABLED=0 go build -o anng ./cmd/anng/main.go

# Run tests
.PHONY: test
test:
	go test ./...

# Clean generated binary
.PHONY: clean
clean:
	rm -f anng
