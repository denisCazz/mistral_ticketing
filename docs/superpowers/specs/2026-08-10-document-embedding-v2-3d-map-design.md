# Document embedding v2 and 3D similarity map

Date: 2026-08-10  
Status: approved design

## Context

The current RAG pipeline:

- splits extracted text into fixed 3,200-character chunks with 400-character overlap;
- stores embeddings as JSON;
- has no content hash or embedding version;
- deletes active chunks before rebuilding them;
- scans every stored vector in application memory and adds a basic lexical score;
- considers a document indexed when at least one chunk exists.

This works for a small archive, but it does not preserve document structure, cannot selectively rebuild stale embeddings, creates a temporary retrieval gap during rebuilds, and scales poorly toward the expected 500–5,000 documents.

## Goals

1. Improve semantic retrieval quality through structure-aware, contextual chunks.
2. Re-index existing documents without rerunning OCR or structured extraction by default.
3. Automatically enqueue new documents and process them reliably.
4. Use PostgreSQL `pgvector` with an HNSW index when available.
5. Preserve the current JSON-vector path as an operational fallback.
6. Show an admin-only 3D map where documents are connected by semantic similarity.
7. Measure retrieval quality before and after the migration.

## Non-goals

- Replacing OpenAI with a self-hosted embedding model.
- Introducing an external vector database.
- Showing individual chunks as 3D nodes.
- Using an LLM reranker on every search request.
- Rendering every document simultaneously when the archive exceeds the visual limit.

## Architecture

### Embedding profile

One configuration object defines the active profile:

- profile version, initially `document-v2`;
- embedding model and fixed dimensions;
- chunk target and overlap in tokens;
- contextual-prefix format;
- normalization version.

The initial vector size is 1,536 dimensions. Calls to supported OpenAI embedding models request that dimension explicitly, preventing accidental shape changes when the model configuration changes.

Every indexed chunk records its profile version, model, dimensions, normalized-content hash, token estimate, chunk position, page range when available, and extraction source. A profile change makes old data stale without requiring destructive updates.

### Structure-aware chunking

Text is normalized without discarding useful line and page boundaries. Chunking uses this order:

1. page boundaries when `DocumentoTesto.pageNumber` is available;
2. headings and paragraph boundaries;
3. sentence boundaries;
4. hard token-safe split only as a fallback.

Chunks target 800–1,200 tokens with approximately 120 tokens of overlap. Very short adjacent sections are merged. Repeated headers, footers, and whitespace are removed when they can be identified safely.

Before embedding, each chunk receives a compact contextual prefix containing available document metadata:

- title;
- category and subcategory;
- linked employee or vehicle;
- document date and expiry date;
- section/page label.

The stored display content remains the original chunk. The prefixed text is used only to produce the embedding, avoiding metadata noise in RAG answers.

### Storage and pgvector fallback

`DocumentoChunk` gains:

- `embeddingVersion`;
- `chunkIndex`;
- `contentHash`;
- `tokenCount`;
- page/section metadata;
- a native `vector(1536)` column when pgvector is available.

The current JSON embedding remains populated during the first rollout. Native vector search is selected by a cached runtime capability check. If the extension or vector column is unavailable, retrieval falls back to the existing JSON representation and reports degraded mode in the admin statistics.

An HNSW cosine index is created for active vectors. PostgreSQL full-text search uses an Italian `tsvector` GIN index. Native retrieval combines vector and lexical ranks with Reciprocal Rank Fusion, then applies document diversity so one long document does not occupy every result.

### Versioned activation

`Documento` records the desired and active embedding versions plus indexed timestamp and embedding status. New chunks are written as a staging version. The worker:

1. builds and embeds every staging chunk;
2. validates count, dimensions, and non-empty vectors;
3. computes the document centroid;
4. activates the new version in one transaction;
5. schedules old versions for cleanup.

The old active version remains searchable if any staging step fails. Search only joins chunks whose version equals the document active version.

### Document centroids and similarity edges

A versioned document-embedding record stores:

- normalized centroid vector and JSON fallback;
- model, dimensions, and chunk count;
- source embedding version and creation time.

The centroid is the normalized weighted mean of active chunk vectors. Extremely short chunks receive less weight.

After activation, the worker finds each document's nearest neighbors and stores the top 3–5 edges above a configurable cosine threshold. An edge records source and target document versions; stale edges are ignored when either active version changes. A periodic reconciliation refreshes missing or stale edges.

## Queue and processing

A persistent AI job table provides:

- document ID and job type;
- target embedding version;
- status, attempts, next run time, and last error;
- lease owner and lease expiry;
- creation, start, and completion timestamps.

Upload and import paths enqueue a full-pipeline job in the same logical operation that creates the document. A reconciliation pass also enqueues any canonical document whose desired version differs from its active version, covering missed or legacy uploads.

A worker command runs continuously in Docker and can also be started locally. Jobs are claimed atomically with a lease, allowing multiple workers without duplicate processing. Failed jobs use exponential retry up to three attempts and then require an admin retry.

Job modes:

- `FULL_PIPELINE`: obtains text, structure, and embedding where missing;
- `EMBEDDING_ONLY`: reuses existing extracted text and rebuilds chunks, vectors, centroid, and edges;
- `FULL_REPROCESS`: explicitly reruns OCR, structure, and embedding.

The normal “Re-index existing documents” action uses `EMBEDDING_ONLY`, avoiding unnecessary OpenAI OCR and extraction cost.

## Admin experience

The existing `/admin/documenti-ai` area gains two views.

### Processing

- Process pending queue.
- Enqueue embedding v2 for all eligible existing documents.
- Optional full reprocess behind an explicit warning.
- Pause, retry failed jobs, and filter logs.
- Show processed documents, chunks, estimated tokens, retries, active profile, pgvector availability, and fallback mode.
- Keep current per-document status and error details.

### 3D map

The map uses WebGL through a dynamically loaded 3D force-graph component:

- one node per document;
- node color by category;
- node size by active chunk count;
- node border/glow by indexing or review state;
- links weighted by semantic similarity;
- hover shows title, category, dates, and similarity summary;
- click opens the document detail or preview;
- search, category, date, similarity-threshold, and status filters;
- camera focus and reset controls.

The graph endpoint is admin-only and returns at most 1,000 nodes per request. It defaults to the most relevant filtered subgraph, while the full archive remains searchable. The response contains document metadata and similarity edges, not chunk text or raw vectors.

`react-force-graph-3d` is the preferred renderer because it supports thousands of WebGL nodes, weighted links, camera controls, and direct integration with React. It must be loaded client-side with SSR disabled.

## Retrieval flow

1. Embed the normalized user query with the active profile.
2. Apply authorization and document filters inside the database query.
3. Retrieve vector and full-text candidate rankings.
4. Fuse rankings with Reciprocal Rank Fusion.
5. Apply a minimum score and document-diversity rule.
6. Return the best chunks with document metadata.
7. Fall back to JSON cosine search only when native vector search is unavailable.

The response and logs identify the retrieval mode so degraded operation is visible.

## Error handling and safety

- A failed rebuild never deletes or deactivates the last valid index.
- Invalid embedding dimensions fail before activation.
- Job leases expire so interrupted workers can recover.
- Retryable OpenAI errors use exponential backoff; authentication and quota errors become terminal after confirmation.
- Cleanup never removes a version referenced as active.
- Admin operations require the existing admin role checks.
- Regular RAG queries preserve current access controls in both native and fallback paths.
- Full reprocessing requires explicit confirmation because it can incur material API cost.

## Quality evaluation

A retrieval gold set contains at least 20 representative Italian queries with expected document IDs. The evaluation script runs the current and v2 pipelines against the same corpus and reports:

- Recall@5;
- Mean Reciprocal Rank;
- percentage of queries with the expected document at rank 1;
- average retrieval latency;
- candidate diversity by document.

Release criteria:

- no Recall@5 or MRR regression;
- target of at least 10% relative Recall@5 improvement;
- no unauthorized documents in results;
- every successful v2 document has a complete active chunk set and centroid.

If the target is not met, chunk size, context prefix, fusion weights, and similarity threshold are tuned against the gold set before v2 becomes the default.

## Tests

### Unit

- normalization and structure-aware chunk boundaries;
- contextual prefix construction;
- stable content hashes;
- profile staleness detection;
- centroid normalization and weighting;
- job retry and lease decisions;
- Reciprocal Rank Fusion and diversity.

### Integration

- optional pgvector capability detection;
- HNSW vector query with authorization filters;
- JSON fallback equivalence on a fixed fixture;
- staging-to-active transaction;
- failed staging preserves old active chunks;
- concurrent workers cannot claim the same job;
- stale similarity edges are excluded.

### API and UI

- all queue and map endpoints reject non-admin users;
- re-index action defaults to embedding-only;
- progress and failure states render correctly;
- map filters and node selection work;
- graph payload respects the 1,000-node limit and omits vectors/chunk text.

## Rollout

1. Add versioned schema, queue, capability detection, and migrations.
2. Implement and benchmark chunking/embedding v2 while v1 stays active.
3. Add native/fallback hybrid retrieval and activate v2 only after evaluation passes.
4. Add worker and enqueue/reconciliation paths.
5. Re-index existing whitelisted documents in controlled batches.
6. Add centroid edges and the 3D admin map.
7. After an observation period, clean old inactive chunks and decide whether duplicate JSON vectors are still required.

## Acceptance criteria

- New canonical documents are automatically queued within one reconciliation interval.
- Existing documents can be re-indexed without rerunning OCR or structure.
- An embedding failure leaves the previous searchable version intact.
- Native pgvector retrieval is used when available and JSON fallback remains functional.
- Admin can see queue progress, failures, profile version, and degraded mode.
- Admin can explore a filtered 3D document-similarity graph and open a selected document.
- The v2 profile satisfies the quality release criteria before becoming the default.
