# Changelog

All notable changes to the PRISM (Platform for Retrieval, Isolation, and Security Metrics) project will be documented in this file.

## [1.3.0] — 2026-05-20
### Added
- Row-Level Security (RLS) enforcement to CSV and SQL silos based on clearance levels.
- Hybrid retrieval scoring merging TF-IDF and keyword matching.
- Graduated confidence scores penalizing based on withheld RLS records.
- Live performance metrics panel in UI dashboard.
- Dynamic cache keying combining role + clearance level.

### Fixed
- Cache poisoning vulnerability where analysts could retrieve cached executive answers.
- CSV parser failure modes on quoted values containing commas.

## [1.2.0] — 2026-05-15
### Added
- Seeding of compliance records spreadsheet (`compliance_records.csv`) under clearance level 3 restriction.
- Input validation sanitizers blocking command/SQL keywords and prompt injections.
- Append-only system auditing logs persisted to disk on query execution.

## [1.1.0] — 2026-05-10
### Added
- Parallel retriever execution to query SQLite and file directories concurrently.
- Interactive explainability trace panel showing details of the query lifecycle.
- Offline fallback answering mode returning formatted local tables when NIM APIs are unreachable.

## [1.0.0] — 2026-05-05
### Added
- Initial deployment of RAG pipeline using Google Gemma 3 IT.
- RBAC enforcement guards at the silo layer for SQL databases, PDFs, and JSON files.
- Basic keyword search query routing.
