SHELL := /bin/bash
.DEFAULT_GOAL := help

.PHONY: help install dev build lint test check clean

help: ## List available targets
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  make %-12s %s\n", $$1, $$2}'

install: ## Install dependencies (needs NODE_AUTH_TOKEN with read:packages for the @avalon-initiative scope)
	npm ci

dev: ## Vite dev server on :5173
	npm run dev

build: ## Type-check and production build into dist/
	npm run build

lint: ## eslint
	npm run lint

test: ## Vitest suites (tests/)
	npm run test

check: ## What CI runs: lint, type-check and build, tests
	npm run lint
	npm run build
	npm run test

clean: ## Remove build output
	rm -rf dist
