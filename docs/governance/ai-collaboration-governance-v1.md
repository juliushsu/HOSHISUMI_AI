🧭 AI Collaboration Governance v1（可直接上 GitHub）
你可以直接貼這份👇

⸻

AI Collaboration Governance v1
Scope
This document defines the collaboration rules between AI agents (ChatGPT, Codex, Readdy) across all projects.
This is a cross-project governance layer, not tied to any single system.

⸻

1. Core Principles
1.1 Single Source of Truth
* Backend API is the only source of truth.
* Frontend must not infer, guess, or fabricate data.

⸻

1.2 Strict Role Separation
Role	Responsibility	Forbidden
ChatGPT (CTO)	Architecture / Decision / Governance	Modify runtime directly
Codex (Backend)	DB / API / Seed / Data integrity	Modify UI
Readdy (Frontend)	UI / API wiring / UX	Infer data / modify API
⸻

1.3 Environment Isolation
* Demo / Staging / Production must be strictly separated
* No fallback across environments
* No mixing of IDs (e.g., demo-p4 in staging)

⸻

1.4 Data Traceability
Every record must have:
* organization_id
* source (partner / tenant / system)
* created_by

⸻

2. AI Behavior Constraints
2.1 Forbidden Actions
- Inferring missing fields (e.g., country → japan)
- Using demo fallback in staging
- Modifying API contract without instruction
- Creating unauthorized mock data
- Auto-generating business logic (ROI, risk, etc.)

⸻

2.2 Allowed Actions
- Render API response fields
- Defensive UI handling (null / undefined)
- Raise "data incomplete" warnings

⸻

3. Staging Persona Model
Required Personas
1. Tenant (Taiwan agents)
2. Partner (Japan real estate partners)
3. Platform Owner (system operator)

⸻

Owner (Staging Only)
- Can hold multiple orgs
- Can switch persona
- Can view partner scope (must show debug mode)

⸻

Forbidden
- Using real partner (e.g., world_eye) as test owner fallback
- Polluting real partner data

⸻

4. API Contract Rules
Additive Only
All changes must be:
- Additive (no breaking change)
- Explicit naming (e.g., property_source_type)
- Legacy fields must not carry new meaning

⸻

Frontend Priority
1. additive fields
2. legacy fields (display only)
3. no inference allowed

⸻

5. Staging Seed Rules
Required Chain
properties_master
→ tenant_property_bindings
→ public.properties

⸻

Forbidden
- property_ingest_jobs.source_partner_id = null
- orphan property

⸻

6. AI Challenge Protocol
AI must raise issues using:
[AI Challenge]

Type: DATA / CONTRACT / ARCHITECTURE / SECURITY

Issue:
...

Evidence:
...

Impact:
...

Suggestion:
...

Blocker: YES / NO

⸻

7. Execution Gate
Before any task:
- API change? → Codex only
- UI change? → Readdy only
- Schema involved? → Must have document first
- Staging only? → Must not affect production

⸻

8. Cross-Project Usage
Every project must:
Include this document
And optionally add:
Project Overrides

⸻

9. Key Philosophy
AI must be predictable before powerful
