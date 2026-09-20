build-IngestFunction:
	npx esbuild services/ingest/src/index.ts --bundle --platform=node \
	  --target=node20 --format=cjs --outfile="$(ARTIFACTS_DIR)/index.js" \
	  --external:@aws-sdk/*

build-ContextFunction:
	npx esbuild services/context/src/index.ts --bundle --platform=node \
	  --target=node20 --format=cjs --outfile="$(ARTIFACTS_DIR)/index.js" \
	  --external:@aws-sdk/*

build-VerdictFunction:
	npx esbuild services/verdict/src/index.ts --bundle --platform=node \
	  --target=node20 --format=cjs --outfile="$(ARTIFACTS_DIR)/index.js" \
	  --external:@aws-sdk/*

build-BoardFunction:
	npx esbuild services/board/src/index.ts --bundle --platform=node \
	  --target=node20 --format=cjs --outfile="$(ARTIFACTS_DIR)/index.js" \
	  --external:@aws-sdk/*

build-AuthFunction:
	npx esbuild services/auth/src/index.ts --bundle --platform=node \
	  --target=node20 --format=cjs --outfile="$(ARTIFACTS_DIR)/index.js" \
	  --external:@aws-sdk/*

build-SemanticFunction:
	npx esbuild services/semantic/src/index.ts --bundle --platform=node \
	  --target=node20 --format=cjs --outfile="$(ARTIFACTS_DIR)/index.js" \
	  --external:@aws-sdk/*
