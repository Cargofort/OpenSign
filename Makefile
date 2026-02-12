build:
	@echo "Building with HOST_URL=${HOST_URL}"
	HOST_URL=${HOST_URL} docker compose up -d --build --force-recreate

up:
	@echo "Building with HOST_URL=${HOST_URL}"
	docker compose up -d

down:
	docker compose down

ssh:
	docker compose exec server bash
