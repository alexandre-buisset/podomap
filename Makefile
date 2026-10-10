.PHONY: install data test dev build

PYTHON := python
NPM := npm

install:
	$(PYTHON) -m pip install -r requirements.txt
	$(NPM) install

data:
	$(PYTHON) -m pipeline.run

test:
	$(PYTHON) -m pytest tests/

dev:
	$(NPM) run dev

build:
	$(NPM) run build
