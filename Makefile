# Development commands for the backend (FastAPI) and frontend (Vite). Run `make` for the list.
#
# On Windows, make runs recipes with cmd.exe unless sh.exe is on PATH (as in Git Bash), so every recipe here works
# in both: paths use forward slashes inside quotes, and the help text is printed by make itself.

ifeq ($(OS),Windows_NT)
  PYTHON ?= python
  VENV_PYTHON := .venv/Scripts/python.exe
else
  PYTHON ?= python3
  VENV_PYTHON := .venv/bin/python
endif

.DEFAULT_GOAL := help
.PHONY: help install install-backend install-frontend run run-backend run-frontend test test-slow lint build gen-api

# `make run backend` and `make run frontend`: the word after `run` names the app, so it must not run as a goal itself
ifeq (run,$(firstword $(MAKECMDGOALS)))
  RUN_APPS := $(wordlist 2,$(words $(MAKECMDGOALS)),$(MAKECMDGOALS))
  ifneq ($(filter-out backend frontend,$(RUN_APPS)),)
    $(error Unknown app '$(filter-out backend frontend,$(RUN_APPS))': use make run backend, make run frontend or make run)
  endif
  .PHONY: backend frontend
  backend frontend: ; @:
endif

define HELP
Usage: make <command>

  install            create backend/.venv and install the backend and frontend dependencies
  run                start the backend and the frontend together (Ctrl+C stops both)
  run backend        start the API with reload        http://127.0.0.1:8000/docs
  run frontend       start the Vite dev server        http://localhost:5173
  test               backend API tests
  test-slow          backend parity checks against the notebook outputs (about 3 min)
  lint               ruff on the backend, oxlint on the frontend
  build              type-check and build the frontend to frontend/dist
  gen-api            export backend/openapi.json and regenerate the frontend API types

The venv reuses the system PyTorch (--system-site-packages). Override the Python that creates it with
make install PYTHON=py
endef

help:
	$(info $(HELP))
	@:

install: install-backend install-frontend

install-backend: backend/$(VENV_PYTHON)
	cd backend && "$(VENV_PYTHON)" -m pip install -r requirements-dev.txt

backend/$(VENV_PYTHON):
	cd backend && $(PYTHON) -m venv --system-site-packages .venv

install-frontend:
	cd frontend && npm install

run:
	@$(MAKE) --no-print-directory -j2 $(addprefix run-,$(or $(RUN_APPS),backend frontend))

run-backend:
	$(if $(wildcard backend/$(VENV_PYTHON)),,$(error backend/.venv not found: run make install first))
	cd backend && "$(VENV_PYTHON)" -m uvicorn app.main:app --reload

# --clearScreen false keeps the API's log on screen when both run in one terminal
run-frontend:
	$(if $(wildcard frontend/node_modules),,$(error frontend/node_modules not found: run make install first))
	cd frontend && npm run dev -- --clearScreen false

test:
	cd backend && "$(VENV_PYTHON)" -m pytest

test-slow:
	cd backend && "$(VENV_PYTHON)" -m pytest -m slow

lint:
	cd backend && "$(VENV_PYTHON)" -m ruff check app tests
	cd frontend && npm run lint

build:
	cd frontend && npm run build

gen-api:
	cd backend && "$(VENV_PYTHON)" -m scripts.export_openapi
	cd frontend && npm run gen:api
