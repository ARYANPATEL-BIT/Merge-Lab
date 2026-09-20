# fixtures

P1-owned. Source trees plus their expected declarations, used to test the
extractor deterministically.

Each fixture is a directory:

```
fixtures/
  <name>/
    input/            # a small source tree the extractor walks
    expected.json     # the Declaration[] the extractor must produce
```

Rules mirrored from the extractor:

- Expected output holds names and types only - never source, diffs, or literals.
- A fixture whose extraction is expected to fail pins `expected.json` to `[]`.
