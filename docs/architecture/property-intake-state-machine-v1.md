# Property Intake State Machine v1

## Status Families

### OCR

- `pending`
- `processing`
- `done`
- `failed`

### Parse

- `pending`
- `processing`
- `done`
- `failed`

### Review

- `pending_review`
- `needs_fix`
- `approved`
- `rejected`

## Canonical Transition

```text
create case
  -> ocr_status = processing
  -> parse_status = pending
  -> review_status = pending_review

ocr success
  -> ocr_status = done
  -> parse_status = processing

ocr unconfigured / failed
  -> ocr_status = failed
  -> parse_status = failed
  -> review_status stays pending_review

parse success
  -> parse_status = done
  -> parsed_payload set
  -> review_status stays pending_review

parse unconfigured / failed
  -> parse_status = failed
  -> review_status stays pending_review

human review
  -> reviewed_payload set
  -> review_status = pending_review | needs_fix | approved | rejected

approve stub
  -> review_status = approved
  -> approval_target_type = property_draft
  -> approved_property_id = null
```

## Transition Rules

- raw file upload failure:
  - case creation fails as request error
- OCR/parse failure after case creation:
  - case is still preserved for manual queue handling
- `reviewed_payload` must not overwrite `parsed_payload`
- approve requires `reviewed_payload`
- this phase does not create or publish live property rows

## Audit Trail Rule

- parser attempts append to `parse_audit_trail`
- human edits append to `review_audit_trail`
- raw file path and OCR text remain traceable on same case

## Non-goals In This Phase

- no async queue / worker system
- no partner auth portal
- no Edge-based OCR orchestration
- no live property publication
